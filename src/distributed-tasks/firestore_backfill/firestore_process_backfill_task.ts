import { Process } from "../../common/process";
import { taskThreadTaskHandler } from "../handler";
import { handlerFromProcess } from "./handler_from_process";
import { FirestoreBackfillOptions } from "./types";

export const firestoreProcessBackfillTask = (
  process: Process,
  options: FirestoreBackfillOptions
) => {
  const handler = handlerFromProcess(process, options);
  return taskThreadTaskHandler(handler, {
    queueName: options.queueName,
    extensionInstanceId: options.extensionInstanceId,
  });
};
