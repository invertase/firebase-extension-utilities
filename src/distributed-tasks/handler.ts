/**
 * Copyright 2023 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { getFunctions } from "firebase-admin/functions";
import * as utils from "./utils";

export interface BackfillTask<P> {
  tasksDoc: string;
  taskId: string;
  collectionName: string;
  chunk: P[];
}

export function taskThreadTaskHandler<P>(
  handler: (chunk: P[]) => Promise<{ success: number }>,
  queueName: string,
  extensionInstanceId?: string
) {
  return async (data: BackfillTask<P>) => {
    // TODO: this needs to be matching what we send
    const { taskId, chunk, tasksDoc } = data;

    functions.logger.info(`Handling task ${taskId}`);

    if (!chunk || chunk.length === 0) {
      functions.logger.info("No data to handle, skipping...");
      return;
    }
    functions.logger.info(`Handling ${chunk.length} documents`);

    const taskRef = admin.firestore().doc(`${tasksDoc}/enqueues/${taskId}`);

    await taskRef.update({
      status: "PROCESSING",
    });

    const { success } = await handler(chunk);

    functions.logger.info(
      `Task ${taskId} completed with ${success} success(es)`
    );

    const tasksDocSnap = await admin.firestore().doc(tasksDoc).get();
    const { totalLength } = tasksDocSnap.data() as any;
    let { processedLength } = tasksDocSnap.data() as any;

    processedLength += success;

    await admin
      .firestore()
      .doc(tasksDoc)
      .update({
        processedLength: admin.firestore.FieldValue.increment(success),
      });

    if (processedLength === totalLength) {
      await admin.firestore().doc(tasksDoc).update({
        status: utils.BackfillStatus.DONE,
      });
    } else {
      await _createNextTask(taskId, tasksDoc, queueName, extensionInstanceId);
    }
  };
}

async function _createNextTask(
  prevId: string,
  tasksDoc: string,
  queueName: string,
  extensionInstanceId?: string
) {
  const taskNum = prevId.split("task")[1];
  const nextId = extensionInstanceId
    ? `ext-${extensionInstanceId}-task-${parseInt(taskNum) + 1}`
    : `task-${parseInt(taskNum) + 1}`;

  functions.logger.info(`Enqueuing the next task ${nextId}`);

  const nextTask = await admin
    .firestore()
    .doc(`${tasksDoc}/enqueues/${nextId}`)
    .get();

  const queue = getFunctions().taskQueue(queueName, extensionInstanceId);

  await queue.enqueue({
    taskId: nextId,
    chunk: nextTask.data()?.chunk,
    tasksDoc,
  });
}
