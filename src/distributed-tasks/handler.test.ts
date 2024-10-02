// handler.test.ts
import { getNextTaskId } from "./handler";

describe("getNextTaskId", () => {
  test("should generate the next task ID without extensionInstanceId", async () => {
    const prevId = "task-5";
    const nextId = await getNextTaskId(prevId);

    expect(nextId).toBe("task-6");
  });

  test("should generate the next task ID with extensionInstanceId", async () => {
    const prevId = "ext-instance123-task-7";
    const extensionInstanceId = "instance123";
    const nextId = await getNextTaskId(prevId, extensionInstanceId);

    expect(nextId).toBe("ext-instance123-task-8");
  });

  test("should throw an error for invalid task ID format", async () => {
    const prevId = "invalid-task-format";

    await expect(getNextTaskId(prevId)).rejects.toThrow(
      `Invalid task ID format: ${prevId}`,
    );
  });

  test("should throw an error for invalid ext-task format", async () => {
    const prevId = "ext-instance123-task-invalid";

    await expect(getNextTaskId(prevId, "instance123")).rejects.toThrow(
      `Invalid task ID format: ${prevId}`,
    );
  });

  test("should return correct next task ID when task number is zero", async () => {
    const prevId = "task-0";
    const nextId = await getNextTaskId(prevId);

    expect(nextId).toBe("task-1");
  });

  test("should return correct next task ID when task number is large", async () => {
    const prevId = "task-99999";
    const nextId = await getNextTaskId(prevId);

    expect(nextId).toBe("task-100000");
  });

  test("should return correct next task ID when extensionInstanceId is provided and task number is large", async () => {
    const prevId = "ext-myInstance-task-99999";
    const extensionInstanceId = "myInstance";
    const nextId = await getNextTaskId(prevId, extensionInstanceId);

    expect(nextId).toBe("ext-myInstance-task-100000");
  });
});
