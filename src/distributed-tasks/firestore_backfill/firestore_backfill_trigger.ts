import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { updateOrCreateMetadataDoc } from "./metadata_document";
import { taskThreadTrigger } from "../trigger";
import { FirestoreBackfillOptions } from "./types";

export const firestoreBackfillTrigger = (options: FirestoreBackfillOptions) => {
  return async () => {
    if (options.setupFn) {
      await options.setupFn();
    }

    const { path, shouldBackfill } = await updateOrCreateMetadataDoc(
      options.metadataDocumentPath,
      options.shouldDoBackfill,
      {
        collectionName: options.collectionName,
        instanceId: options.extensionInstanceId,
        createdAt: admin.firestore.Timestamp.now(),
        ...options.metadata,
      }
    );

    if (!shouldBackfill) {
      // logs.backfillNotRequired();
      return;
    }

    try {
      const refs = await getDocsForBackfilling(options);

      if (refs.length === 0) {
        // logs.backfillNotRequired();
        return;
      }
      functions.logger.info("Enqueuing backfill tasks 🚀");

      return taskThreadTrigger<string>({
        tasksDoc: path,
        queueName: options.queueName,
        batchSize: 50,
        taskParams: refs.map((ref) => ref.id),
        extensionInstanceId: options.extensionInstanceId,
      });
    } catch (error) {
      functions.logger.error("Error with backfill trigger");
      functions.logger.error(error);
    }
  };
};

const getDocsForBackfilling = async (options: FirestoreBackfillOptions) => {
  let refs: FirebaseFirestore.DocumentReference[] = [];

  if (options.useCollectionGroupQuery) {
    // Use collectionGroup to query across all collections with the same name
    const collectionGroup = admin
      .firestore()
      .collectionGroup(options.collectionName);
    // Use select to only get the document ID (no other data)
    const snapshot = await collectionGroup.select().get();

    if (snapshot.empty) {
      functions.logger.info(
        `No documents found in the collection group ${options.collectionName} 📚`
      );
    } else {
      functions.logger.info(
        `Found ${snapshot.size} documents in the collection group ${options.collectionName} 📚`
      );
      refs = snapshot.docs.map((doc) => doc.ref);
    }
  } else {
    // Use collection to query a specific collection
    const collection = admin.firestore().collection(options.collectionName);
    // Use select to only get the document ID (no other data)
    const snapshot = await collection.select().get();

    if (snapshot.empty) {
      functions.logger.info(
        `No documents found in the collection ${options.collectionName} 📚`
      );
    } else {
      functions.logger.info(
        `Found ${snapshot.size} documents in the collection ${options.collectionName} 📚`
      );
      refs = snapshot.docs.map((doc) => doc.ref);
    }
  }

  return refs;
};
