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

interface BackfillHandlerOptions {
  queueName: string;
  extensionInstanceId?: string;
  onComplete?: (total: number) => Promise<void>;
}

export function taskThreadTaskHandler<P>(
  handler: (chunk: P[]) => Promise<{ success: number; failed: number }>,
  { queueName, extensionInstanceId, onComplete }: BackfillHandlerOptions
) {
  return async (data: BackfillTask<P>) => {
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

    let success = 0;
    let failed = 0;

    try {
      const result = await handler(chunk);
      success = result.success;
      failed = result.failed;
    } catch (error) {
      functions.logger.error(`Error handling task ${taskId}: ${error}`);
      failed = chunk.length; // Assuming the entire chunk failed if there's an error
    }

    functions.logger.info(
      `Task ${taskId} completed with ${success} success(es) and ${failed} failure(s)`
    );

    await taskRef.update({
      status: "DONE",
      success,
      failed,
    });

    const tasksDocSnap = await admin.firestore().doc(tasksDoc).get();

    let { totalLength, processedLength, failedLength } =
      tasksDocSnap.data() as {
        totalLength: number;
        processedLength: number;
        failedLength: number;
      };

    processedLength += success;
    failedLength += failed;

    await admin
      .firestore()
      .doc(tasksDoc)
      .update({
        processedLength: admin.firestore.FieldValue.increment(success),
        failedLength: admin.firestore.FieldValue.increment(failed),
      });

    console.log(
      `processedLength: ${processedLength}, failedLength: ${failedLength}, totalLength: ${totalLength}`
    );

    if (processedLength + failedLength === totalLength) {
      const status =
        failedLength > 0
          ? utils.BackfillStatus.FAILED
          : utils.BackfillStatus.DONE;
      await admin.firestore().doc(tasksDoc).update({
        status,
      });
      if (onComplete) {
        await onComplete(totalLength);
      }
    } else {
      await _createNextTask(taskId, tasksDoc, queueName, extensionInstanceId);
    }
  };
}

export async function _createNextTask(
  prevId: string,
  tasksDoc: string,
  queueName: string,
  extensionInstanceId?: string
) {
  const taskNumMatch = prevId.match(/(\d+)$/);
  const taskNum = taskNumMatch ? parseInt(taskNumMatch[0]) : 0;
  const nextId = extensionInstanceId
    ? `ext-${extensionInstanceId}-task-${taskNum + 1}`
    : `task-${taskNum + 1}`;

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
