import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import { DocumentSnapshot } from "firebase-functions/v1/firestore";
import { Process } from "../../common/process";
import { chunkArray } from "../utils";
import { FirestoreBackfillOptions } from "./types";

export const handlerFromProcess =
  (process: Process, options: FirestoreBackfillOptions) =>
  async (chunk: string[]) => {
    // Get documents from Firestore
    const docs = await getValidDocs(process, chunk, options);

    if (docs.length === 0) {
      functions.logger.info("No data to handle, skipping...");
      return { success: 0, failed: 0 };
    }

    functions.logger.info(`Handling ${docs.length} documents`);

    if (docs.length === 1) {
      const data = docs[0].data();

      if (!data) {
        functions.logger.error(
          `Document ${docs[0].ref.path} does not have any data`
        );
        return { success: 0, failed: 1 };
      }

      const result = await process.processFn(data);

      try {
        await docs[0].ref.update({
          ...result,
          [`status.${process.id}.state`]: "BACKFILLED",
          [`status.${process.id}.completeTime`]:
            admin.firestore.FieldValue.serverTimestamp(),
        });
        return { success: 1, failed: 0 };
      } catch (e) {
        functions.logger.error(e);
        return { success: 0, failed: 1 };
      }
    }

    const batches = chunkArray(docs, 50);
    let successCount = 0;
    let failedCount = 0;

    const results = await Promise.all(
      batches.map(async (batch) => {
        const batchData = batch
          .map((doc) => {
            const data = doc.data();
            if (!data) {
              functions.logger.warn(`Document ${doc.ref.path} has no data`);
              return null;
            }
            return data;
          })
          .filter((data) => data !== null);

        return process.batchProcess(batchData);
      })
    );

    const toWrite = results.flat();
    const writer = admin.firestore().batch();

    for (let i = 0; i < toWrite.length; i++) {
      try {
        writer.update(docs[i].ref, {
          ...toWrite[i],
          [`status.${process.id}.state`]: "BACKFILLED",
          [`status.${process.id}.completeTime`]:
            admin.firestore.FieldValue.serverTimestamp(),
        });
        successCount++;
      } catch (e) {
        functions.logger.error(`Failed to update document ${docs[i].id}: ${e}`);
        failedCount++;
      }
    }

    await writer.commit();

    functions.logger.info(`Completed processing ${docs.length} documents`);

    return { success: successCount, failed: failedCount };
  };

export async function getValidDocs(
  process: Process,
  documentIds: string[],
  options: FirestoreBackfillOptions
) {
  const documents: DocumentSnapshot[] = [];

  await admin.firestore().runTransaction(async (transaction) => {
    if (options.useCollectionGroupQuery) {
      const collectionGroup = admin
        .firestore()
        .collectionGroup(options.collectionName);
      const snapshots = await Promise.all(
        documentIds.map((id) =>
          collectionGroup
            .where(admin.firestore.FieldPath.documentId(), "==", id)
            .get()
        )
      );

      snapshots.forEach((snapshot) => {
        snapshot.forEach((doc) => {
          addValidDoc(doc, process, documents);
        });
      });
    } else {
      const refs = documentIds.map((id) =>
        admin.firestore().collection(options.collectionName).doc(id)
      );
      const docs = await transaction.getAll(...refs);

      docs.forEach((doc) => {
        addValidDoc(doc, process, documents);
      });
    }
  });

  return documents;
}

function addValidDoc(
  doc: DocumentSnapshot,
  process: Process,
  documents: DocumentSnapshot[]
) {
  const data = doc.data();
  if (!data) {
    functions.logger.warn(`Document ${doc.ref.path} has no data`);
  } else if (!process.shouldBackfill || !process.shouldBackfill(data)) {
    functions.logger.warn(
      `Document ${doc.ref.path} is not valid for ${process.id} process`
    );
  } else if (
    data.status &&
    data.status[process.id] &&
    data.status[process.id].state &&
    data.status[process.id].state === "BACKFILLED"
  ) {
    functions.logger.warn(`Document ${doc.ref.path} is already backfilled`);
  } else {
    documents.push(doc);
  }
}
