import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { FirestoreField } from "../../firestore-onwrite-processor/types";

export type Metadata = {
  collectionName: string;
  instanceId?: string;
  createdAt: admin.firestore.Timestamp;
  [key: string]: FirestoreField;
};

export const getMetadataDoc = async (
  metadataDocumentPath: string,
  metadata: Metadata
) => {
  functions.logger.info(
    `Fetching existing metadata doc for ${metadata.collectionName} 📝`
  );

  const metadataDoc = await admin.firestore().doc(metadataDocumentPath).get();

  if (!metadataDoc.exists) {
    functions.logger.info(
      `No existing metadata doc found for ${metadata.collectionName} 📝`
    );
    return null;
  }
  return metadataDoc;
};

export const createMetadataDoc = async (
  metadataDocumentPath: string,
  metadata: Metadata
) => {
  functions.logger.info("Creating a new metadata doc");
  const doc = admin.firestore().doc(metadataDocumentPath);

  await doc.set(metadata);

  return doc;
};

export const updateMetadataDoc = async (
  metadataDocumentPath: string,
  metadata: Metadata
) => {
  functions.logger.info("Updating existing metadata doc");
  const doc = admin.firestore().doc(metadataDocumentPath);

  await doc.update(metadata);

  return doc;
};

export const updateOrCreateMetadataDoc = async (
  metadataDocumentPath: string,
  shouldRunBackfill: (data: Record<string, FirestoreField>) => Promise<boolean>,
  metadata: Metadata
) => {
  const metadataDoc = await getMetadataDoc(metadataDocumentPath, metadata);

  let shouldBackfill = true;

  if (metadataDoc) {
    shouldBackfill = await shouldRunBackfill(metadataDoc.data() as Metadata);
    if (shouldBackfill) {
      await updateMetadataDoc(metadataDocumentPath, metadata);
    }
    return { path: metadataDoc.ref.path, shouldBackfill };
  }

  const doc = await createMetadataDoc(metadataDocumentPath, metadata);

  return { path: doc.path, shouldBackfill };
};
