import { Process } from "../../common/process";
import { taskThreadTaskHandler } from "../handler";
import { handlerFromProcess } from "./handler_from_process";
import { FirestoreBackfillOptions } from "./types";

export const firestoreProcessBackfillTask = (
  process: Process,
  { queueName, extensionInstanceId }: FirestoreBackfillOptions
) => {
  const handler = handlerFromProcess(process);
  return taskThreadTaskHandler(handler, queueName, extensionInstanceId);
};
