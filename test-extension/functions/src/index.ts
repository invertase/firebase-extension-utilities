import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import {
  firestoreProcessBackfillTask,
  firestoreProcessBackfillTrigger,
  FirestoreOnWriteProcess,
  FirestoreOnWriteProcessor,
  FirestoreBackfillOptions,
} from "@invertase/firebase-extension-utilities";

admin.initializeApp();

// this could be translating or whatever

const processFn = async ({ foo }: { foo: string }) => {
  return { foo: foo + "Bar" };
};

const myProcess = new FirestoreOnWriteProcess(processFn, {
  id: "myProcess",
  collectionName: "myCollection",
  fieldDependencyArray: ["foo"],
  shouldBackfill: (data) => data["foo"] && typeof data["foo"] === "string",
  batchFn: async (data) => {
    return data.map((doc) => ({ ...doc, foo: doc.foo + "Bar" }));
  },
});

//  backfill is simply exporting these two, the package handles everything else.
// Note that only a single process is currently supported

const backfillOptions: FirestoreBackfillOptions = {
  queueName: "backfillTask",
  metadataDocumentPath:
    "backfills/myMetadataDocument_" + process.env.EXT_INSTANCE_ID!,
  shouldDoBackfill: async () => true,
  extensionInstanceId: process.env.EXT_INSTANCE_ID!,
};

export const backfillTrigger = functions.tasks
  .taskQueue()
  .onDispatch(firestoreProcessBackfillTrigger(myProcess, backfillOptions));

export const backfillTask = functions.tasks
  .taskQueue()
  .onDispatch(firestoreProcessBackfillTask(myProcess, backfillOptions));

// adding an onWrite trigger is also simple:

const onWriteProcessor = new FirestoreOnWriteProcessor({
  processes: [myProcess],
});

export const onWrite = functions.firestore
  .document("myCollection/{docId}")
  .onWrite((change) => onWriteProcessor.run(change));
