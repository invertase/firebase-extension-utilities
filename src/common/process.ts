import { FirestoreField } from "./types";

interface ProcessOptions {
  id: string;
  fieldDependencyArray?: string[];
  shouldBackfill?: (data: Record<string, FirestoreField>) => boolean;
  errorFn?: (e: unknown) => string | void | Promise<string | void>;
  batchFn?: (
    data: Record<string, FirestoreField>[]
  ) => Promise<Record<string, FirestoreField>[]>;
  shouldProcess?: (
    oldData: Record<string, FirestoreField>,
    newData: Record<string, FirestoreField>
  ) => boolean;
}

type ProcessFunction = (
  data: Record<string, FirestoreField>
) => Record<string, FirestoreField> | Promise<Record<string, FirestoreField>>;
type ShouldBackfillFunction = (data: Record<string, FirestoreField>) => boolean;
type ErrorFunction = (e: unknown) => string | void | Promise<string | void>;
type BatchFunction = (
  data: Record<string, FirestoreField>[]
) => Promise<Record<string, FirestoreField>[]>;
type ShouldOnWriteProcessFunction = (
  oldData: Record<string, FirestoreField>,
  newData: Record<string, FirestoreField>
) => boolean;

export class Process {
  public readonly processFn: ProcessFunction;
  public readonly id: string;
  public readonly fieldDependencyArray: string[];
  public readonly shouldBackfill?: ShouldBackfillFunction;
  public readonly errorFn?: ErrorFunction;
  public readonly batchFn?: BatchFunction;
  public readonly shouldProcessFn?: ShouldOnWriteProcessFunction;

  constructor(processFn: ProcessFunction, options: ProcessOptions) {
    const {
      id,
      fieldDependencyArray,
      shouldBackfill,
      errorFn,
      batchFn,
      shouldProcess,
    } = options;
    this.id = id;
    this.fieldDependencyArray = fieldDependencyArray;
    this.shouldBackfill = shouldBackfill;
    this.errorFn = errorFn;
    this.batchFn = batchFn ? async (data) => batchFn(data) : undefined;
    this.shouldProcessFn = shouldProcess;
    this.processFn = async (data) => processFn(data);
  }

  async batchProcess(
    data: Record<string, FirestoreField>[]
  ): Promise<Record<string, FirestoreField>[]> {
    if (this.batchFn) {
      return this.batchFn(data);
    }
    const allSettled = Promise.allSettled(data.map(this.processFn));
    const results = await allSettled;
    const output: Record<string, FirestoreField>[] = [];
    for (const result of results) {
      if (result.status === "fulfilled") {
        output.push(result.value);
      } else {
        const error = result.reason;
        if (this.errorFn) {
          await this.errorFn(error);
        }
      }
    }
    return output;
  }

  shouldProcess(
    oldData: Record<string, FirestoreField>,
    newData: Record<string, FirestoreField>
  ): boolean {
    if (this.shouldProcessFn && !this.shouldProcessFn(oldData, newData)) {
      return false;
    }
    for (const field of this.fieldDependencyArray) {
      const newValue = newData && newData[field];
      const oldValue = oldData && oldData[field];
      if (newValue !== oldValue) {
        return true; // Process if any field value has changed.
      }
    }
    return false;
  }
}
