import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import { DocumentSnapshot } from "firebase-functions/v1/firestore";
import { Process } from "../../common/process";
import { chunkArray } from "../utils";
import { FirestoreBackfillOptions } from "./types";

export const handlerFromProcess =
  (process: Process, options: FirestoreBackfillOptions) =>
  async (chunk: string[]) => {
    //  get documents from firestore
    const { validDocuments, skippedDocuments } = await getValidDocs(
      process,
      chunk,
      options,
    );

    if (validDocuments.length === 0) {
      functions.logger.info("No data to handle, skipping...");
      return { success: 0, failed: 0, skipped: skippedDocuments.length };
    }

    functions.logger.info(`Handling ${validDocuments.length} documents`);

    if (validDocuments.length === 1) {
      return await handleSingleDocument(
        process,
        validDocuments[0],
        skippedDocuments,
        options,
      );
    }

    const batches = chunkArray(validDocuments, process.batchSize || 50);
    let failedDocumentsCount = 0;

    const results = await Promise.allSettled(
      batches.map((batch) =>
        process.batchProcess(batch.map((doc) => doc.data())),
      ),
    );

    const writer = admin.firestore().batch();

    results.forEach((result, index) => {
      const batch = batches[index];
      if (result.status === "rejected") {
        // A failed batch means all its documents are considered failed
        failedDocumentsCount += batch.length;
        functions.logger.error(`Batch ${index + 1} failed`, result.reason);

        const updatePayload = {
          [`${options.statusField}.${process.id}.state`]: "FAILED_BACKFILL",
          [`${options.statusField}.${process.id}.completeTime`]:
            admin.firestore.FieldValue.serverTimestamp(),
        };

        batch.forEach((doc) => {
          writer.update(
            admin.firestore().collection(options.collectionName).doc(doc.id),
            updatePayload,
          );
        });
      } else {
        batch.forEach((doc, i) => {
          const updatePayload = {
            ...result.value[i],
            [`${options.statusField}.${process.id}.state`]: "BACKFILLED",
            [`${options.statusField}.${process.id}.completeTime`]:
              admin.firestore.FieldValue.serverTimestamp(),
          };

          writer.update(
            admin.firestore().collection(options.collectionName).doc(doc.id),
            updatePayload,
          );
        });
      }
    });

    await writer.commit();

    const totalProcessed = validDocuments.length;
    const successCount = totalProcessed - failedDocumentsCount;

    return {
      success: successCount,
      failed: failedDocumentsCount,
      skipped: skippedDocuments.length,
    };
  };

export async function getValidDocs(
  process: Process,
  documentIds: string[],
  options: FirestoreBackfillOptions,
) {
  const validDocuments: DocumentSnapshot[] = [];
  const skippedDocuments: DocumentSnapshot[] = [];

  await admin.firestore().runTransaction(async (transaction) => {
    const refs = documentIds.map((id: string) =>
      admin.firestore().collection(options.collectionName).doc(id),
    );
    //@ts-ignore
    const docs = await transaction.getAll<DocumentData>(...refs);

    for (let doc of docs) {
      const data = doc.data();
      if (!process.shouldBackfill || !process.shouldBackfill(data)) {
        skippedDocuments.push(doc);
        functions.logger.warn(
          `Document ${doc.ref.path} is not valid for ${process.id} process`,
        );
      } else if (
        // TODO: add a param for backfill strategy
        data[options.statusField] &&
        data[options.statusField][process.id] &&
        data[options.statusField][process.id]["state"] &&
        data[options.statusField][process.id].state !== "BACKFILLED"
      ) {
        skippedDocuments.push(doc);
        functions.logger.warn(
          `Document ${doc.ref.path} is not in the correct state to be backfilled`,
        );
      } else {
        validDocuments.push(doc);
      }
    }
  });

  return { validDocuments, skippedDocuments };
}

const handleSingleDocument = async (
  process: Process,
  document: DocumentSnapshot,
  skippedDocuments: DocumentSnapshot[],
  options: FirestoreBackfillOptions,
) => {
  try {
    const result = await process.processFn(document.data()!);
    await admin
      .firestore()
      .collection(options.collectionName)
      .doc(document.id)
      .update({
        ...result,
        [`${options.statusField}.${process.id}.state`]: "BACKFILLED",
        [`${options.statusField}.${process.id}.completeTime`]:
          admin.firestore.FieldValue.serverTimestamp(),
      });
    return { success: 1, failed: 0, skipped: skippedDocuments.length };
  } catch (e) {
    functions.logger.error(e);
    await admin
      .firestore()
      .collection(options.collectionName)
      .doc(document.id)
      .update({
        [`${options.statusField}.${process.id}.state`]: "FAILED_BACKFILL",
        [`${options.statusField}.${process.id}.completeTime`]:
          admin.firestore.FieldValue.serverTimestamp(),
      });

    return { success: 0, failed: 1, skipped: skippedDocuments.length };
  }
};
