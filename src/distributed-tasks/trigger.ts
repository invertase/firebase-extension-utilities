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

import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import { getFunctions } from "firebase-admin/functions";
import { getExtensions } from "firebase-admin/extensions";
import { BackfillStatus, chunkArray } from "./utils";

interface BackfillTrigger<P> {
  tasksDoc: string;
  queueName: string;
  batchSize: number;
  extensionInstanceId?: string;
  taskParams: P[];
}
/**
 * function to set up a cloud tasks thread
 * @param tasksDoc - the document to store the tasks status
 * @param queueName - the name of the queue to use
 * @param batchSize - the size of the batch to use
 * @param extensionInstanceId - the id of the extension instance (if any)
 * @param taskParams - the parameters to pass to the task
 * @returns
 */
export async function taskThreadTrigger<P>({
  tasksDoc,
  queueName,
  batchSize,
  extensionInstanceId,
  taskParams,
}: BackfillTrigger<P>) {
  const runtime = extensionInstanceId ? getExtensions().runtime() : undefined;

  const queue = getFunctions().taskQueue(queueName, extensionInstanceId);

  let writer = admin.firestore().batch();

  try {
    let counter = 1;

    await admin.firestore().doc(tasksDoc).set({
      totalLength: taskParams.length,
      processedLength: 0,
      status: BackfillStatus.PENDING,
    });

    const chunks = chunkArray(taskParams, batchSize);

    for (const chunk of chunks) {
      const taskId = extensionInstanceId
        ? `ext-${extensionInstanceId}-task-${counter}`
        : `task-${counter}`;

      if (counter === 1) {
        // Enqueue the first task to be executed immediately.
        functions.logger.info(`Enqueuing the first task ${taskId} 🚀`);

        await queue.enqueue({ taskId, chunk, tasksDoc });
      }

      try {
        // Create a task document to track the progress of the task.
        writer.set(admin.firestore().doc(`${tasksDoc}/enqueues/${taskId}`), {
          taskId: taskId,
          status: BackfillStatus.PENDING,
          chunk: chunk,
        });

        if (counter % batchSize === 0 || chunks.length < batchSize) {
          functions.logger.info("Committing the batch...");

          await writer.commit();
          writer = admin.firestore().batch();
        }
      } catch (error) {
        functions.logger.error(error);
        if (runtime) {
          await runtime.setProcessingState(
            "PROCESSING_FAILED",
            "Failed. for more details check the logs."
          );
        }

        throw error;
      }

      counter++;
    }

    functions.logger.info(`${counter} tasks enqueued successfully 🚀`);
    if (runtime) {
      return runtime.setProcessingState(
        "PROCESSING_COMPLETE",
        "Successfully enqueued all tasks to backfill the data."
      );
    }
  } catch (error) {
    functions.logger.error(error);
    if (runtime) {
      await runtime.setProcessingState(
        "PROCESSING_FAILED",
        "Failed. for more details check the logs."
      );
    }

    throw error;
  }
}
