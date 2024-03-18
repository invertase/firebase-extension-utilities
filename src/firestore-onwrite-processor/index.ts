import { getChangeType, ChangeType, now } from "./utils";
import { FirestoreField, Status, State, Change } from "./types";
import { Process } from "../common/process";

// Re-export the `Process` class for external use, renaming it for clarity.
export { Process as FirestoreOnWriteProcess } from "../common/process";

// Define a class to process Firestore document writes.
export class FirestoreOnWriteProcessor {
  // Fields for specifying document fields and handling errors.
  statusField: string;
  processes: Process[];
  orderField: string;
  errorFn?: (e: unknown) => Promise<string | void>;

  // Constructor to initialize the processor with custom options.
  constructor(options: {
    processes: Process[];
    statusField?: string;
    orderField?: string;
    errorFn?: (e: unknown) => Promise<string | void>;
  }) {
    // Set default values for optional parameters.
    this.orderField = options.orderField || "createTime";
    this.processes = options.processes;
    this.statusField = options.statusField || "status";
    this.errorFn = options.errorFn; // Optional custom error handling function.
  }

  // Private method to record the start of processing.
  private async writeStartEvent(change: Change, processesToRun: Process[]) {
    const updateTime = now(); // Get the current time.

    // Determine the initial data for the update, focusing on order.

    // Update the document to reflect the processes being started.
    let update = {};
    for (const process of processesToRun) {
      const startData = change.after.get(
        `${this.statusField}.${process.id}.${this.orderField}`
      );
      update = {
        ...update,
        [`${this.statusField}.${process.id}`]: {
          state: State.PROCESSING,
          startTime: updateTime,
          [this.orderField]: startData || change.after.createTime,
          updateTime,
        },
      };
    }
    await change.after.ref.update(update); // Apply the update to the Firestore document.
  }

  // Private method to record the completion of processing.
  private async writeCompletionEvent(
    change: Change,
    output: Record<string, FirestoreField>,
    completedProcesses: Process[],
    failedProcesses: Process[]
  ) {
    const updateTime = now(); // Get the current time for the update.

    // Start with the output as the basis for the update.
    let update: Record<string, FirestoreField> = { ...output };

    // Mark completed processes as such in the document.
    for (const process of completedProcesses) {
      const statusField = `${this.statusField}.${process.id}`;

      update = {
        ...update,
        [`${statusField}.state`]: State.COMPLETED,
        [`${statusField}.updateTime`]: updateTime,
        [`${statusField}.completeTime`]: updateTime,
      };
    }

    // Mark failed processes with an error state.
    for (const process of failedProcesses) {
      const statusField = `${this.statusField}.${process.id}`;

      update = {
        ...update,
        [`${statusField}.state`]: State.ERROR,
        [`${statusField}.updateTime`]: updateTime,
      };
    }
    await change.after.ref.update(update); // Apply the update to the Firestore document.
  }

  // Method to retrieve the current status map from the document.
  async getStatusMap(change: Change): Promise<Record<string, Status>> {
    const statusMap = change.after.get(this.statusField) || {};
    return statusMap;
  }

  // The main method to run the processor on document change.
  async run(change: Change): Promise<void> {
    const changeType = getChangeType(change);
    // Exit early if the document was deleted.
    if (changeType === ChangeType.DELETE) return;

    // Retrieve the current status map and data before and after the change.
    const statusMap = change.after.get(this.statusField) || {};
    const oldData = change.before?.data() as Record<string, FirestoreField>;
    const newData = change.after?.data() as Record<string, FirestoreField>;

    const processesToRun: Process[] = [];

    // Determine which processes should run based on their conditions.
    for (const process of this.processes) {
      const status = statusMap[process.id];
      const state = status?.state;

      // Skip processes already in a final state.
      if (
        [
          State.PROCESSING,
          State.COMPLETED,
          State.ERROR,
          State.BACKFILLED,
        ].includes(state)
      ) {
        continue;
      }

      // Check if the process's conditions for running are met.
      const shouldProcess = process.shouldProcess(oldData, newData);
      if (!shouldProcess) {
        continue;
      }
      processesToRun.push(process);
    }

    if (processesToRun.length === 0) {
      return; // Exit early if no processes should run.
    }

    // Record the start of processing.
    await this.writeStartEvent(change, processesToRun);

    let completedProcesses: Process[] = [];
    let failedProcesses: Process[] = [];
    let finalOutput: Record<string, FirestoreField> = {};

    // Process each selected process.
    for (const process of processesToRun) {
      try {
        // Attempt to process and capture output.
        const output = await process.processFn(newData);
        completedProcesses.push(process);
        finalOutput = {
          ...finalOutput,
          ...output,
        };
      } catch (e) {
        // Handle any errors, using a custom error function if provided.
        failedProcesses.push(process);
        if (process.errorFn) {
          await process.errorFn(e);
        } else if (this.errorFn) {
          await this.errorFn(e);
        }
      }
      // Record the completion of processing.
    }

    await this.writeCompletionEvent(
      change,
      finalOutput,
      completedProcesses,
      failedProcesses
    );
  }
}
