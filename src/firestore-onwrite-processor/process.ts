import { FirestoreField } from "./utils";

export class Process {
  processFn: (
    data: Record<string, FirestoreField>
  ) => Promise<Record<string, FirestoreField>>;
  id: string;
  fieldDependencyArray: string[];
  errorFn?: (e: unknown) => Promise<string | void>;
  shouldProcess?: (
    oldData: Record<string, FirestoreField>,
    newData: Record<string, FirestoreField>
  ) => boolean;

  constructor(
    processFn: (
      data: Record<string, FirestoreField>
    ) =>
      | Record<string, FirestoreField>
      | Promise<Record<string, FirestoreField>>,
    options: {
      id: string;
      fieldDependencyArray: string[];
      shouldProcess?: (
        oldData: Record<string, FirestoreField>,
        newData: Record<string, FirestoreField>
      ) => boolean;
      errorFn?: (e: unknown) => Promise<string | void>;
    }
  ) {
    this.id = options.id;
    this.fieldDependencyArray = options.fieldDependencyArray;
    this.processFn = async (data: Record<string, FirestoreField>) =>
      processFn(data);
    this.errorFn = options.errorFn;
    this.shouldProcess = function (
      oldData: Record<string, FirestoreField>,
      newData: Record<string, FirestoreField>
    ) {
      if (options.shouldProcess) {
        if (!options.shouldProcess(oldData, newData)) {
          return false;
        }
      }
      for (const field of this.fieldDependencyArray) {
        const newValue = newData && newData[field];
        const oldValue = oldData && oldData[field];
        if (newValue !== oldValue) {
          return true;
        }
      }
      return false;
    };
  }
}
