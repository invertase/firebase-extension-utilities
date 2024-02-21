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
    const docs = await getValidDocs(process, chunk, options);

    if (docs.length === 0) {
      functions.logger.info("No data to handle, skipping...");
      return { success: 0 };
    }

    functions.logger.info(`Handling ${docs.length} documents`);

    if (docs.length === 1) {
      // TODO: get rid of ! assertion
      const result = await process.processFn(docs[0].data()!);

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

    const results = await Promise.all(
      batches.map(async (batch) => {
        // TODO: get rid of ! assertion
        return process.batchProcess(batch.map((doc) => doc.data()!));
      })
    );

    const toWrite = results.flat();
    const writer = admin.firestore().batch();

    for (let i = 0; i < toWrite.length; i++) {
      writer.update(
        admin.firestore().collection(options.collectionName).doc(docs[i].id),
        {
          ...toWrite[0],
          [`status.${process.id}.state`]: "BACKFILLED",
          [`status.${process.id}.completeTime`]:
            admin.firestore.FieldValue.serverTimestamp(),
        }
      );
    }
    await writer.commit();

    functions.logger.info(`Completed processing ${docs.length} documents`);

    return { success: docs.length };
  };

async function getValidDocs(
  process: Process,
  documentIds: string[],
  options: FirestoreBackfillOptions
) {
  const documents: DocumentSnapshot[] = [];

  await admin.firestore().runTransaction(async (transaction) => {
    const refs = documentIds.map((id: string) =>
      admin.firestore().collection(options.collectionName).doc(id)
    );
    //@ts-ignore
    const docs = await transaction.getAll<DocumentData>(...refs);

    for (let doc of docs) {
      const data = doc.data();
      if (!process.shouldBackfill || !process.shouldBackfill(data)) {
        functions.logger.warn(
          `Document ${doc.ref.path} is not valid for ${process.id} process`
        );
      } else if (
        // TODO: add a param for backfill strategy
        data["status"] &&
        data["status"][process.id] &&
        data["status"][process.id]["state"] &&
        data["status"][process.id].state !== "BACKFILLED"
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
