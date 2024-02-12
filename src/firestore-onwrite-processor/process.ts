import { FirestoreField } from "./utils";

export class Process<
  TInput extends Record<string, FirestoreField>,
  TOutput extends Record<string, FirestoreField>,
> {
  id: string;
  fieldDependencyArray: string[];
  processFn: (data: TInput) => Promise<TOutput>;
  errorFn: (e: unknown) => Promise<string | void>;
  shouldProcess?: (oldData: TInput, newData: TInput) => boolean;

  constructor(options: {
    id: string;
    fieldDependencyArray: string[];
    processFn: (data: TInput) => Promise<TOutput>;
    shouldProcess?: (oldData: TInput, newData: TInput) => boolean;
    statusField?: string;
  }) {
    this.id = options.id;
    this.fieldDependencyArray = options.fieldDependencyArray;
    this.processFn = options.processFn;
    this.shouldProcess = function (oldData: TInput, newData: TInput) {
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
