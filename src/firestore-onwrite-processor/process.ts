import { FirestoreField } from "./types";

// Define the Process class.
export class Process {
  // Declare the process function that takes a data object and returns a Promise of a data object.
  processFn: (
    data: Record<string, FirestoreField>
  ) => Promise<Record<string, FirestoreField>>;

  // Unique identifier for the process.
  id: string;

  // Array of field names this process depends on to determine if it should run.
  fieldDependencyArray: string[];

  // Optional error handling function to execute if the process function throws an error.
  errorFn?: (e: unknown) => Promise<string | void>;

  // Optional function to determine whether the process should be executed based on old and new data.
  shouldProcess: (
    oldData: Record<string, FirestoreField>,
    newData: Record<string, FirestoreField>
  ) => boolean;

  // Constructor to initialize a Process instance with a function and options.
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
    this.id = options.id; // Set the process ID.
    this.fieldDependencyArray = options.fieldDependencyArray; // Set the dependency fields.
    // Wrap the provided function to ensure it always returns a Promise.
    this.processFn = async (data: Record<string, FirestoreField>) =>
      processFn(data);
    this.errorFn = options.errorFn; // Set the error handling function if provided.

    // Define a method to determine if the process should be executed.
    // This method first checks if a custom shouldProcess function is provided and uses it to decide.
    // If not provided, or if it returns true, it then checks if any of the dependent fields have changed.
    this.shouldProcess = function (
      oldData: Record<string, FirestoreField>,
      newData: Record<string, FirestoreField>
    ) {
      if (options.shouldProcess) {
        // Use the custom shouldProcess function to decide.
        if (!options.shouldProcess(oldData, newData)) {
          return false; // Don't process if the custom function returns false.
        }
      }
      // Default behavior: process if any dependency field has changed.
      for (const field of this.fieldDependencyArray) {
        const newValue = newData && newData[field];
        const oldValue = oldData && oldData[field];
        if (newValue !== oldValue) {
          return true; // Process if any field value has changed.
        }
      }
      return false; // Don't process if none of the dependency fields have changed.
    };
  }
}
