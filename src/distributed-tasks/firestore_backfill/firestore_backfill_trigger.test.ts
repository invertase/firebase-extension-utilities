import { firestoreBackfillTrigger } from "./firestore_backfill_trigger";
import { updateOrCreateMetadataDoc } from "./metadata_document";
import { taskThreadTrigger } from "../trigger";
import * as admin from "firebase-admin";
import { FirestoreBackfillOptions } from "./types";

jest.mock("./metadata_document");
jest.mock("../trigger");
jest.mock("firebase-admin", () => ({
  firestore: jest.fn(() => ({
    Timestamp: {
      now: jest.fn(() => "mockTimestamp"),
    },
    collectionGroup: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      get: jest.fn(),
    })),
    collection: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      get: jest.fn(),
    })),
  })),
}));

const mockUpdateOrCreateMetadataDoc = updateOrCreateMetadataDoc as jest.Mock;
const mockTaskThreadTrigger = taskThreadTrigger as jest.Mock;
const mockFirestore = admin.firestore() as jest.Mocked<
  ReturnType<typeof admin.firestore>
>;

// describe("firestoreBackfillTrigger", () => {
//   const options: FirestoreBackfillOptions = {
//     metadataDocumentPath: "path/to/metadata",
//     shouldDoBackfill: async () => true,
//     collectionName: "testCollection",
//     extensionInstanceId: "testInstanceId",
//     queueName: "testQueue",
//     useCollectionGroupQuery: false,
//     metadata: {},
//   };

//   beforeEach(() => {
//     jest.clearAllMocks();
//   });

//   test("should not backfill if shouldBackfill is false", async () => {
//     mockUpdateOrCreateMetadataDoc.mockResolvedValue({
//       path: "testPath",
//       shouldBackfill: false,
//     });

//     const trigger = firestoreBackfillTrigger(options);
//     await trigger();

//     expect(mockUpdateOrCreateMetadataDoc).toHaveBeenCalled();
//     // logs.backfillNotRequired should be checked here if available
//     expect(mockTaskThreadTrigger).not.toHaveBeenCalled();
//   });

//   test("should log and return if no documents found", async () => {
//     mockUpdateOrCreateMetadataDoc.mockResolvedValue({
//       path: "testPath",
//       shouldBackfill: true,
//     });
//     mockFirestore
//       .collection()
//       .select()
//       .get.mockResolvedValueOnce({ empty: true, size: 0, docs: [] });

//     const trigger = firestoreBackfillTrigger(options);
//     await trigger();

//     expect(mockUpdateOrCreateMetadataDoc).toHaveBeenCalled();
//     expect(mockFirestore.collection).toHaveBeenCalledWith(
//       options.collectionName
//     );
//     // logs.backfillNotRequired should be checked here if available
//     expect(mockTaskThreadTrigger).not.toHaveBeenCalled();
//   });

//   test("should enqueue backfill tasks when documents are found", async () => {
//     const mockDocs = [
//       { id: "doc1", ref: { id: "doc1" } },
//       { id: "doc2", ref: { id: "doc2" } },
//     ];
//     mockUpdateOrCreateMetadataDoc.mockResolvedValue({
//       path: "testPath",
//       shouldBackfill: true,
//     });
//     mockFirestore
//       .collection()
//       .select()
//       .get.mockResolvedValueOnce({ empty: false, size: 2, docs: mockDocs });

//     const trigger = firestoreBackfillTrigger(options);
//     await trigger();

//     expect(mockUpdateOrCreateMetadataDoc).toHaveBeenCalled();
//     expect(mockFirestore.collection).toHaveBeenCalledWith(
//       options.collectionName
//     );
//     expect(mockTaskThreadTrigger).toHaveBeenCalledWith({
//       tasksDoc: "testPath",
//       queueName: options.queueName,
//       batchSize: 50,
//       taskParams: ["doc1", "doc2"],
//       extensionInstanceId: options.extensionInstanceId,
//     });
//   });

//   test("should log error if an exception occurs", async () => {
//     const error = new Error("Test error");
//     mockUpdateOrCreateMetadataDoc.mockResolvedValue({
//       path: "testPath",
//       shouldBackfill: true,
//     });
//     mockFirestore.collection().select().get.mockRejectedValueOnce(error);

//     const trigger = firestoreBackfillTrigger(options);
//     await trigger();

//     expect(mockUpdateOrCreateMetadataDoc).toHaveBeenCalled();
//     expect(mockFirestore.collection).toHaveBeenCalledWith(
//       options.collectionName
//     );
//     // Check logs for error logging if applicable
//     expect(mockTaskThreadTrigger).not.toHaveBeenCalled();
//   });
// });
