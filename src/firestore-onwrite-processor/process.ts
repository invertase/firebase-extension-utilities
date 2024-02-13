import { FirestoreField } from "./utils";

export class Process<
  TInput extends Record<string, FirestoreField>,
  TOutput extends Record<string, FirestoreField>,
> {
  processFn: (data: TInput) => Promise<TOutput>;
  id: string;
  fieldDependencyArray: string[];
  errorFn?: (e: unknown) => Promise<string | void>;
  shouldProcess?: (oldData: TInput, newData: TInput) => boolean;

  constructor(
    processFn: (data: TInput) => TOutput | Promise<TOutput>,
    options: {
      id: string;
      fieldDependencyArray: string[];
      shouldProcess?: (oldData: TInput, newData: TInput) => boolean;
      errorFn?: (e: unknown) => Promise<string | void>;
    },
  ) {
    this.id = options.id;
    this.fieldDependencyArray = options.fieldDependencyArray;
    this.processFn = async (data: TInput) => processFn(data);
    this.errorFn = options.errorFn;
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
