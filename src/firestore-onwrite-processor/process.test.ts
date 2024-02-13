import { Process } from "./process"; // Adjust the import path as necessary
import { FirestoreField } from "./types"; // Adjust the import path as necessary

describe("Process class", () => {
  // Test the processFn execution
  test("should execute processFn with provided data", async () => {
    const mockData: Record<string, FirestoreField> = { testField: "testValue" };
    const processFn = jest
      .fn()
      .mockResolvedValue({ processedField: "processedValue" });
    const process = new Process(processFn, {
      id: "testProcess",
      fieldDependencyArray: ["testField"],
    });

    const result = await process.processFn(mockData);

    expect(processFn).toHaveBeenCalledWith(mockData);
    expect(result).toEqual({ processedField: "processedValue" });
  });

  // Test the error handling with errorFn
  test("should call errorFn on processFn failure", async () => {
    const errorFn = jest.fn();
    const processFn = jest.fn().mockRejectedValue(new Error("Test Error"));
    const process = new Process(processFn, {
      id: "testProcess",
      fieldDependencyArray: [],
      errorFn,
    });

    try {
      await process.processFn({});
    } catch (error) {
      await process.errorFn?.(error);
    }

    expect(errorFn).toHaveBeenCalled();
  });

  // Test shouldProcess logic
  test("shouldProcess returns true if no shouldProcess function is provided and data has changed", () => {
    const oldData = { testField: "oldValue" };
    const newData = { testField: "newValue" };
    const process = new Process(jest.fn(), {
      id: "testProcess",
      fieldDependencyArray: ["testField"],
    });

    const shouldProcessResult = process.shouldProcess(oldData, newData);

    expect(shouldProcessResult).toBe(true);
  });

  // Test shouldProcess with custom function
  test("shouldProcess respects custom shouldProcess function", () => {
    const customShouldProcess = jest.fn().mockReturnValue(false);
    const process = new Process(jest.fn(), {
      id: "testProcess",
      fieldDependencyArray: ["testField"],
      shouldProcess: customShouldProcess,
    });
    const oldData = { testField: "oldValue" };
    const newData = { testField: "newValue" };

    const shouldProcessResult = process.shouldProcess(oldData, newData);

    expect(customShouldProcess).toHaveBeenCalledWith(oldData, newData);
    expect(shouldProcessResult).toBe(false);
  });

  // Test shouldProcess when no fields have changed
  test("shouldProcess returns false when dependent fields have not changed", () => {
    const oldData = { testField: "sameValue" };
    const newData = { testField: "sameValue" };
    const process = new Process(jest.fn(), {
      id: "testProcess",
      fieldDependencyArray: ["testField"],
    });

    const shouldProcessResult = process.shouldProcess(oldData, newData);

    expect(shouldProcessResult).toBe(false);
  });
});
