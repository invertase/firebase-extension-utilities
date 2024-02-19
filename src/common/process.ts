import { FirestoreField } from "./types";

export class Process {
  public readonly processFn: (
    data: Record<string, FirestoreField>,
  ) => Promise<Record<string, FirestoreField>>;

  public readonly id: string;
  public readonly collectionName: string;
  public readonly fieldDependencyArray: string[];
  public readonly isValidDoc?: (
    data: Record<string, FirestoreField>,
  ) => boolean;
  public readonly errorFn?: (
    e: unknown,
  ) => string | void | Promise<string | void>;
  public readonly batchFn?: (
    data: Record<string, FirestoreField>[],
  ) => Promise<Record<string, FirestoreField>[]>;
  public readonly shouldProcessFn?: (
    oldData: Record<string, FirestoreField>,
    newData: Record<string, FirestoreField>,
  ) => boolean;

  constructor(
    processFn: (
      data: Record<string, FirestoreField>,
    ) =>
      | Record<string, FirestoreField>
      | Promise<Record<string, FirestoreField>>,
    {
      id,
      collectionName,
      fieldDependencyArray,
      isValidDoc,
      errorFn,
      batchFn,
      shouldProcess: shouldProcessFn,
    }: {
      id: string;
      collectionName: string;
      fieldDependencyArray: string[];
      isValidDoc?: (data: Record<string, FirestoreField>) => boolean;
      errorFn?: (e: unknown) => string | void | Promise<string | void>;
      batchFn?: (
        data: Record<string, FirestoreField>[],
      ) =>
        | Record<string, FirestoreField>[]
        | Promise<Record<string, FirestoreField>[]>;
      shouldProcess?: (
        oldData: Record<string, FirestoreField>,
        newData: Record<string, FirestoreField>,
      ) => boolean;
    },
  ) {
    this.id = id;
    this.collectionName = collectionName;
    this.fieldDependencyArray = fieldDependencyArray;
    this.isValidDoc = isValidDoc;
    this.errorFn = errorFn;
    this.batchFn = batchFn
      ? async (data: Record<string, FirestoreField>[]) => batchFn(data)
      : undefined;
    this.shouldProcessFn = shouldProcessFn;
    this.processFn = async (data: Record<string, FirestoreField>) =>
      processFn(data);
  }

  async batchProcess(
    data: Record<string, FirestoreField>[],
  ): Promise<Record<string, FirestoreField>[]> {
    if (this.batchFn) {
      return this.batchFn(data);
    }
    // Default batch processing: process each item individually.
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
    newData: Record<string, FirestoreField>,
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
