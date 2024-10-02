import * as admin from "firebase-admin";
import { Process } from "../../common/process";
import { getValidDocs } from "./handler_from_process";
import { FirestoreBackfillOptions } from "./types";

process.env.GCLOUD_PROJECT = "demo-gcp";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";

admin.initializeApp({
  projectId: "demo-gcp",
});

const firestoreObserver = jest.fn((_x: any) => {});

describe.skip("getValidDocs", () => {
  let unsubscribe: (() => void) | undefined;

  // clear firestore
  beforeEach(async () => {
    await fetch(
      `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-gcp/databases/(default)/documents`,
      { method: "DELETE" },
    );
    jest.clearAllMocks();

    // set up observer on collection
    unsubscribe = admin
      .firestore()
      .collection("metadatas")
      .onSnapshot((snap: any) => {
        /** There is a bug on first init and write, causing the the emulator to the observer is called twice
         * A snapshot is registered on the first run, this affects the observer count
         * This is a workaround to ensure the observer is only called when it should be
         */
        if (snap.docs.length) firestoreObserver(snap);
      });
  });

  afterEach(() => {
    if (unsubscribe && typeof unsubscribe === "function") {
      unsubscribe();
    }
    jest.clearAllMocks();
  });

  test("should return valid documents according to process criteria", async () => {
    // const process = {
    //   id: "testProcess",
    //   shouldBackfill: jest.fn(
    //     (data) =>
    //       data.isValid &&
    //       data.status?.testProcess?.state === "READY_FOR_BACKFILL"
    //   ),
    // };

    const process = new Process((data) => data, {
      id: "testProcess",
      shouldBackfill: (data) => true,
    });

    const documentIds = ["doc1", "doc2", "doc3"];
    const options: FirestoreBackfillOptions = {
      statusField: "status",
      queueName: "testQueue",
      collectionName: "testCollection",
      shouldDoBackfill: () => Promise.resolve(true),
      metadataDocumentPath: "testMetadataPath",
      metadata: {
        collectionName: "testCollection",
        lastBackfillTime: admin.firestore.FieldValue.serverTimestamp(),
      },
    };

    // Assume we have pre-created these documents in the mock Firestore setup
    // For the sake of this example, let's assume "doc1" meets the criteria, but "doc2" and "doc3" do not.

    const validDocs = await getValidDocs(process, documentIds, options);

    expect(validDocs).toHaveLength(1);
    expect(validDocs[0].id).toBe("doc1");
    expect(process.shouldBackfill).toHaveBeenCalledTimes(3); // Assuming it's called for each document
    // You may also want to check logs if your mock supports it, to ensure the correct logging behavior
  });
});
