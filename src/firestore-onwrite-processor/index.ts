import {
  Change,
  State,
  getChangeType,
  ChangeType,
  now,
  FirestoreField,
  Status,
} from "./utils";
import { Process } from "./process";
export { Process as FirestoreOnWriteProcess } from "./process";

export class FirestoreOnWriteProcessor {
  statusField: string;
  processes: Process[];
  processUpdates: boolean;
  orderField: string;
  errorFn: (e: unknown) => Promise<string | void>;

  constructor(options: {
    processes: Process[];
    statusField?: string;
    orderField?: string;
    errorFn?: (e: unknown) => Promise<string | void>;
  }) {
    this.orderField = options.orderField || "createTime";
    this.processes = options.processes;
    this.statusField = options.statusField || "status";
    this.processUpdates = true;
    this.errorFn = options.errorFn;
  }

  private async writeStartEvent(change: Change, processesToRun: Process[]) {
    const updateTime = now();

    const startData = change.after.get(this.orderField);

    let update: Record<string, FirestoreField> = startData
      ? { [this.orderField]: startData }
      : { [this.orderField]: change.after.createTime };

    for (const process of processesToRun) {
      update = {
        ...update,
        [`${this.statusField}.${process.id}`]: {
          state: State.PROCESSING,
          startTime: updateTime,
          updateTime,
        },
      };
    }
    await change.after.ref.update(update);
  }

  private async writeCompletionEvent(
    change: Change,
    output: Record<string, FirestoreField>,
    completedProcesses: Process[],
    failedProcesses: Process[]
  ) {
    const updateTime = now();

    let update: Record<string, FirestoreField> = { ...output };

    for (const process of completedProcesses) {
      const statusField = `${this.statusField}.${process.id}`;

      const stateField = `${statusField}.state`;
      const updateTimeField = `${statusField}.updateTime`;
      const completeTimeField = `${statusField}.completeTime`;

      update = {
        ...update,
        [stateField]: State.COMPLETED,
        [updateTimeField]: updateTime,
        [completeTimeField]: updateTime,
      };
    }

    for (const process of failedProcesses) {
      const statusField = `${this.statusField}.${process.id}`;

      const stateField = `${statusField}.state`;
      const updateTimeField = `${statusField}.updateTime`;
      update = {
        ...update,
        [stateField]: State.ERROR,
        [updateTimeField]: updateTime,
      };
    }
    await change.after.ref.update(update);
  }

  async getStatusMap(change: Change): Promise<Record<string, Status>> {
    const statusMap = change.after.get(this.statusField) || {};
    return statusMap;
  }

  async run(change: Change): Promise<void> {
    const changeType = getChangeType(change);
    if (changeType === ChangeType.DELETE) return;

    // Initialize or get the status
    // const state: State = change.after.get(this.statusMapField)?.state;

    //  get status map

    const statusMap = change.after.get(this.statusField) || {};

    const oldData = change.before?.data() as Record<string, FirestoreField>;
    const newData = change.after?.data() as Record<string, FirestoreField>;

    const processesToRun: Process[] = [];

    for (const process of this.processes) {
      // get status
      const status = statusMap[process.id];
      // get state
      const state = status?.state;

      // check if we should process
      if ([State.PROCESSING, State.COMPLETED, State.ERROR].includes(state)) {
        continue;
      }

      const shouldProcess = process.shouldProcess(oldData, newData);
      if (!shouldProcess) {
        continue;
      }
      processesToRun.push(process);
    }
    // write start event
    await this.writeStartEvent(change, processesToRun);

    let completedProcesses = [];
    let failedProcesses = [];
    let finalOutput: Record<string, FirestoreField>;

    for (const process of processesToRun) {
      try {
        const output = await process.processFn(newData);

        completedProcesses.push(process);
        finalOutput = {
          ...finalOutput,
          ...output,
        };
      } catch (e) {
        failedProcesses.push(process);
        if (process.errorFn) {
          await process.errorFn(e);
        } else if (this.errorFn) {
          await this.errorFn(e);
        }
      }
      await this.writeCompletionEvent(
        change,
        finalOutput,
        completedProcesses,
        failedProcesses
      );
    }
  }
}
