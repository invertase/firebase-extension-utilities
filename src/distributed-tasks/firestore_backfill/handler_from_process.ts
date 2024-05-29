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
      return { success: 0 };
    }

    functions.logger.info(`Handling ${docs.length} documents`);

    if (docs.length === 1) {
      const data = docs[0].data();

      if (!data) {
        functions.logger.error(
          `Document ${docs[0].ref.path} does not have any data`
        );
        return { success: 0 };
      }

      const result = await process.processFn(data);

      try {
        await admin
          .firestore()
          .collection(options.collectionName)
          .doc(chunk[0])
          .update({
            ...result,
            [`status.${process.id}.state`]: "BACKFILLED",
            [`status.${process.id}.completeTime`]:
              admin.firestore.FieldValue.serverTimestamp(),
          });
        return { success: 1 };
      } catch (e) {
        functions.logger.error(e);
        return { success: 0 };
      }
    }

    const batches = chunkArray(docs, 50);
    let successCount = 0;

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
        writer.update(
          admin.firestore().collection(options.collectionName).doc(docs[i].id),
          {
            ...toWrite[i],
            [`status.${process.id}.state`]: "BACKFILLED",
            [`status.${process.id}.completeTime`]:
              admin.firestore.FieldValue.serverTimestamp(),
          }
        );
        successCount++;
      } catch (e) {
        functions.logger.error(`Failed to update document ${docs[i].id}: ${e}`);
      }
    }

    await writer.commit();

    functions.logger.info(`Completed processing ${docs.length} documents`);

    return { success: successCount };
  };

export async function getValidDocs(
  process: Process,
  documentIds: string[],
  options: FirestoreBackfillOptions
) {
  const documents: DocumentSnapshot[] = [];

  await admin.firestore().runTransaction(async (transaction) => {
    const refs = documentIds.map((id) =>
      admin.firestore().collection(options.collectionName).doc(id)
    );
    const docs = await transaction.getAll(...refs);

    for (const doc of docs) {
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
        data.status[process.id].state !== "BACKFILLED"
      ) {
        functions.logger.warn(
          `Document ${doc.ref.path} is not in the correct state to be backfilled`
        );
      } else {
        documents.push(doc);
      }
    }
  });

  return documents;
}
