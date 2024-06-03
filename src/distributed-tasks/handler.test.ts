import * as admin from "firebase-admin";
import { getFunctions } from "firebase-admin/functions";
import * as functions from "firebase-functions";
import {
  _createNextTask,
  BackfillTask,
  taskThreadTaskHandler,
} from "./handler";

// Mock Firestore functions
const mockDoc = jest.fn();
const mockDocGetData = jest.fn();
const mockUpdate = jest.fn();
const mockIncrement = jest.fn();

const mockFirestore = () => {
  return {
    doc: (path: string) => {
      mockDoc(path);
      return {
        get: async () => {
          return {
            data: () => mockDocGetData(),
          };
        },
        update: mockUpdate,
      };
    },
  };
};

jest.mock("firebase-admin", () => {
  return {
    firestore: () => mockFirestore(),
  };
});

// add mock FieldValue to our mock
Object.defineProperty(admin.firestore, "FieldValue", {
  value: {
    increment: (value: number) => {
      mockIncrement(value);
      return value;
    },
  },
});

// Mock Firebase Functions
const mockGetFunctions = jest.fn();
const mockEnqueue = jest.fn();
const mockTaskQueue = jest.fn();
const mockLoggerInfo = jest.fn();

jest.mock("firebase-admin/functions", () => ({
  getFunctions: (instanceId: string) => {
    mockGetFunctions(instanceId);
    return {
      taskQueue: (queueName: string) => {
        mockTaskQueue(queueName);
        return {
          enqueue: mockEnqueue,
        };
      },
    };
  },
}));

jest.mock("firebase-functions", () => ({
  logger: {
    info: (x: any) => mockLoggerInfo(x),
  },
}));
describe("handler", () => {
  describe("_createNextTask", () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test("should enqueue the next task with the correct parameters", async () => {
      const prevId = "ext-testExtensionId-task-1";
      const tasksDoc = "testTasksDoc";
      const queueName = "testQueue";
      const extensionInstanceId = "testExtensionId";

      mockDocGetData.mockReturnValue({ chunk: "testChunk" });

      await _createNextTask(prevId, tasksDoc, queueName, extensionInstanceId);

      expect(mockDoc).toHaveBeenCalledWith(
        "testTasksDoc/enqueues/ext-testExtensionId-task-2"
      );
      expect(mockDocGetData).toHaveBeenCalled();
      expect(mockEnqueue).toHaveBeenCalledWith({
        taskId: "ext-testExtensionId-task-2",
        chunk: "testChunk",
        tasksDoc: "testTasksDoc",
      });
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        "Enqueuing the next task ext-testExtensionId-task-2"
      );
    });

    test("should handle missing task number in prevId", async () => {
      const prevId = "task-";
      const tasksDoc = "testTasksDoc";
      const queueName = "testQueue";

      await _createNextTask(prevId, tasksDoc, queueName);

      expect(mockDoc).toHaveBeenCalledWith("testTasksDoc/enqueues/task-1");
      expect(mockDocGetData).toHaveBeenCalled();
      expect(mockEnqueue).toHaveBeenCalledWith({
        taskId: "task-1",
        chunk: "testChunk",
        tasksDoc: "testTasksDoc",
      });
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        "Enqueuing the next task task-1"
      );
    });

    test("should handle missing extensionInstanceId", async () => {
      const prevId = "task-1";
      const tasksDoc = "testTasksDoc";
      const queueName = "testQueue";

      mockDocGetData.mockReturnValue({ chunk: "testChunk" });

      await _createNextTask(prevId, tasksDoc, queueName);

      expect(mockDoc).toHaveBeenCalledWith("testTasksDoc/enqueues/task-2");
      expect(mockDocGetData).toHaveBeenCalled();
      expect(mockEnqueue).toHaveBeenCalledWith({
        taskId: "task-2",
        chunk: "testChunk",
        tasksDoc: "testTasksDoc",
      });
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        "Enqueuing the next task task-2"
      );
    });

    test("should increment task number correctly", async () => {
      const prevId = "task-5";
      const tasksDoc = "testTasksDoc";
      const queueName = "testQueue";

      mockDocGetData.mockReturnValue({ chunk: "testChunk" });

      await _createNextTask(prevId, tasksDoc, queueName);

      expect(mockDoc).toHaveBeenCalledWith("testTasksDoc/enqueues/task-6");
      expect(mockDocGetData).toHaveBeenCalled();
      expect(mockEnqueue).toHaveBeenCalledWith({
        taskId: "task-6",
        chunk: "testChunk",
        tasksDoc: "testTasksDoc",
      });
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        "Enqueuing the next task task-6"
      );
    });
  });

  describe("taskThreadTaskHandler", () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test("should process chunk and update task status to DONE if all documents are processed", async () => {
      const handler = jest.fn().mockResolvedValue({ success: 5 });
      const queueName = "testQueue";
      const extensionInstanceId = "testExtensionId";
      const backfillTaskData: BackfillTask<string> = {
        taskId: "task-1",
        chunk: ["1", "2", "3", "4", "5"],
        tasksDoc: "testTasksDoc",
        collectionName: "testCollection",
      };

      const taskHandler = taskThreadTaskHandler(
        handler,
        queueName,
        extensionInstanceId
      );

      mockDocGetData.mockReturnValueOnce({
        totalLength: 5,
        processedLength: 0,
      });

      await taskHandler(backfillTaskData);

      expect(mockLoggerInfo).toHaveBeenCalledWith("Handling task task-1");
      expect(mockLoggerInfo).toHaveBeenCalledWith("Handling 5 documents");
      expect(mockDoc).toHaveBeenCalledWith("testTasksDoc/enqueues/task-1");

      expect(mockUpdate).toHaveBeenCalledWith({ status: "PROCESSING" });
      expect(handler).toHaveBeenCalledWith(backfillTaskData.chunk);
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        "Task task-1 completed with 5 success(es)"
      );
      expect(mockDoc).toHaveBeenCalledWith("testTasksDoc");
      expect(mockIncrement).toHaveBeenCalledWith(5);

      const callsToUpdate = mockUpdate.mock.calls;
      expect(callsToUpdate.length).toBe(3);
      expect(callsToUpdate[0][0]).toEqual({
        status: "PROCESSING",
      });
      expect(callsToUpdate[1][0]).toEqual({
        processedLength: 5,
      });
      expect(callsToUpdate[2][0]).toEqual({
        status: "DONE",
      });
    });

    test("should skip processing if chunk is empty", async () => {
      const handler = jest.fn();
      const queueName = "testQueue";
      const extensionInstanceId = "testExtensionId";
      const backfillTaskData: BackfillTask<string> = {
        taskId: "task-2",
        chunk: [],
        tasksDoc: "testTasksDoc",
        collectionName: "testCollection",
      };

      const taskHandler = taskThreadTaskHandler(
        handler,
        queueName,
        extensionInstanceId
      );

      await taskHandler(backfillTaskData);

      expect(mockLoggerInfo).toHaveBeenCalledWith("Handling task task-2");
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        "No data to handle, skipping..."
      );
      expect(handler).not.toHaveBeenCalled();
      expect(mockDoc).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });
});
