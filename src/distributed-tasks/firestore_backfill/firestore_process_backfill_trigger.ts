import * as functions from "firebase-functions";
import { Process } from "../../common/process";
import * as admin from "firebase-admin";
import { updateOrCreateMetadataDoc } from "./metadata_document";
import { taskThreadTrigger } from "../trigger";
import { FirestoreBackfillOptions } from "./types";

export const firestoreProcessBackfillTrigger = (
  process: Process,
  {
    queueName,
    metadataDocumentPath,
    shouldDoBackfill,
    extensionInstanceId,
    metadata,
  }: FirestoreBackfillOptions
) => {
  return async () => {
    const { path, shouldBackfill } = await updateOrCreateMetadataDoc(
      metadataDocumentPath,
      shouldDoBackfill,
      {
        collectionName: process.collectionName,
        instanceId: extensionInstanceId,
        createdAt: admin.firestore.Timestamp.now(),
        ...metadata,
      }
    );

    if (!shouldBackfill) {
      // logs.backfillNotRequired();
      return;
    }

    try {
      const refs = await getDocsForBackfilling(process);

      if (refs.length === 0) {
        // logs.backfillNotRequired();
        return;
      }
      functions.logger.info("Enqueuing backfill tasks 🚀");

      return taskThreadTrigger<string>({
        tasksDoc: path,
        queueName,
        batchSize: 50,
        taskParams: refs.map((ref) => ref.id),
        extensionInstanceId,
      });
    } catch (error) {
      functions.logger.error("Error with backfill trigger");
      functions.logger.error(error);
    }
  };
};

const getDocsForBackfilling = async (process: Process) => {
  const collection = admin.firestore().collection(process.collectionName);

  const refs = await collection.listDocuments();

  if (refs.length === 0) {
    functions.logger.info(
      `No documents found in the collection ${process.collectionName} 📚`
    );
    return [];
  }

  functions.logger.info(
    `Found ${refs.length} documents in the collection ${process.collectionName} 📚`
  );
  return refs;
};
