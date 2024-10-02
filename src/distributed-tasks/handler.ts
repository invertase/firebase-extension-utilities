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
  handler: (
    chunk: P[]
  ) => Promise<{ success: number; failed: number; skipped: number }>,
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

    const { success, failed, skipped } = await handler(chunk);

    await taskRef.update({
      status: utils.BackfillStatus.DONE,
    });

    functions.logger.info(
      `Task ${taskId} completed with ${success} success(es)`
    );

    const tasksDocSnap = await admin.firestore().doc(tasksDoc).get();
    let {
      backfillJobsTotal: totalTasks,
      backfillJobsProcessed: processedTasks,
      backfillJobsSkipped: skippedTasks,
      backfillJobsFailed: failedTasks,
    } = tasksDocSnap.data() as any;

    //  check if null or undefined or not a number
    if (
      [totalTasks, processedTasks, skippedTasks, failedTasks].some(
        (val) => val === null || val === undefined || typeof val !== "number"
      )
    ) {
      throw new Error("Invalid task document");
    }

    processedTasks += success;
    skippedTasks += skipped;
    failedTasks += failed;

    await admin
      .firestore()
      .doc(tasksDoc)
      .update({
        backfillJobsFailed: admin.firestore.FieldValue.increment(failed),
        backfillJobsSkipped: admin.firestore.FieldValue.increment(skipped),
        backfillJobsProcessed: admin.firestore.FieldValue.increment(success),
      });

    functions.logger.info(
      `Current state: ${processedTasks} processed, ${skippedTasks} skipped, ${failedTasks} failed out of ${totalTasks} total tasks`
    );

    if (processedTasks + skippedTasks + failedTasks === totalTasks) {
      await admin.firestore().doc(tasksDoc).update({
        backfillStatus: utils.BackfillStatus.DONE,
      });
    } else {
      await _createNextTask(taskId, tasksDoc, queueName, extensionInstanceId);
    }
  };
}

export async function getNextTaskId(
  prevId: string,
  extensionInstanceId?: string
) {
  const taskPattern = /^task-\d+$/;
  const extTaskPattern = new RegExp(`^ext-${extensionInstanceId}-task-\\d+$`);

  if (
    !taskPattern.test(prevId) &&
    (!extensionInstanceId || !extTaskPattern.test(prevId))
  ) {
    throw new Error(`Invalid task ID format: ${prevId}`);
  }

  const taskNum = prevId.split("task-")[1];
  const nextId = extensionInstanceId
    ? `ext-${extensionInstanceId}-task-${parseInt(taskNum) + 1}`
    : `task-${parseInt(taskNum) + 1}`;

  return nextId;
}

async function _createNextTask(
  prevId: string,
  tasksDoc: string,
  queueName: string,
  extensionInstanceId?: string
) {
  const nextId = getNextTaskId(prevId, extensionInstanceId);

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
