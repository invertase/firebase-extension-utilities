import * as functions from "firebase-functions";
import { Process } from "../../common/process";
import * as admin from "firebase-admin";
import { updateOrCreateMetadataDoc } from "./metadata_document";
import { taskThreadTrigger } from "../trigger";
import { FirestoreBackfillOptions } from "./types";

export const firestoreProcessBackfillTrigger = (
  process: Process,
  options: FirestoreBackfillOptions
) => {
  return async () => {
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
  const collection = admin.firestore().collection(options.collectionName);

  const refs = await collection.listDocuments();

  if (refs.length === 0) {
    functions.logger.info(
      `No documents found in the collection ${options.collectionName} 📚`
    );
    return [];
  }

  functions.logger.info(
    `Found ${refs.length} documents in the collection ${options.collectionName} 📚`
  );
  return refs;
};
