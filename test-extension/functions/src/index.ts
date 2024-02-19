import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {
  firestoreProcessBackfillTask,
  firestoreProcessBackfillTrigger,
  FirestoreOnWriteProcess,
  FirestoreOnWriteProcessor,
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
  isValidDoc: (data) => data["foo"] && typeof data["foo"] === "string",
});

//  backfill is simply exporting these two, the package handles everything else.
// Note that only a single process is currently supported

const backfillOptions = {
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
