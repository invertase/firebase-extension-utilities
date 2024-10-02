import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import fetch from "node-fetch";
import {
  createMetadataDoc,
  updateMetadataDoc,
  getMetadataDoc,
  updateOrCreateMetadataDoc,
} from "./metadata_document";

process.env.GCLOUD_PROJECT = "demo-gcp";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";

admin.initializeApp({
  projectId: "demo-gcp",
});

describe("Firestore Metadata Operations", () => {
  // Helper function to clear Firestore emulator data
  const clearFirestore = async () => {
    await fetch(
      `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-gcp/databases/(default)/documents`,
      { method: "DELETE" },
    );
  };

  beforeEach(async () => {
    // Clear Firestore before each test to ensure a clean state
    await clearFirestore();
  });

  afterAll(async () => {
    // Clean up Firestore emulator after all tests
    await clearFirestore();
  });

  test("should create a fresh metadata document", async () => {
    const randomString = Math.random().toString();
    const metadataDocumentPath = `metadatas/${randomString}`;
    const metadata = {
      collectionName: "testCollection",
      instanceId: "testInstance",
      createdAt: Timestamp.now(),
    };

    // Create a metadata document
    const docRef = await createMetadataDoc(metadataDocumentPath, metadata);

    // Fetch the created document
    const doc = await docRef.get();

    // Assertions
    expect(doc.exists).toBeTruthy();
    expect(doc.data()).toEqual(metadata);
  });

  test("should update an existing metadata document", async () => {
    const randomString = Math.random().toString();
    const metadataDocumentPath = `metadatas/${randomString}`;

    const initialMetadata = {
      collectionName: "initialCollection",
      instanceId: "initialInstance",
      createdAt: Timestamp.now(),
    };
    const updatedMetadata = {
      collectionName: "updatedCollection",
      instanceId: "updatedInstance",
      createdAt: initialMetadata.createdAt, // Ensure createdAt remains unchanged
    };

    // Create the initial document
    const docRef = await createMetadataDoc(
      metadataDocumentPath,
      initialMetadata,
    );

    // Update the document
    await updateMetadataDoc(metadataDocumentPath, updatedMetadata);

    // Fetch the updated document
    const updatedDoc = await docRef.get();

    // Assertions
    expect(updatedDoc.exists).toBeTruthy();
    expect(updatedDoc.data()).toEqual(updatedMetadata);
  });

  test("should fetch an existing metadata document", async () => {
    const randomString = Math.random().toString();
    const metadataDocumentPath = `metadatas/${randomString}`;

    const metadata = {
      collectionName: "fetchCollection",
      instanceId: "fetchInstance",
      createdAt: Timestamp.now(),
    };

    // Create a metadata document
    await createMetadataDoc(metadataDocumentPath, metadata);

    // Fetch the document using getMetadataDoc
    const metadataDoc = await getMetadataDoc(metadataDocumentPath, metadata);

    // Assertions
    expect(metadataDoc.exists).toBeTruthy();
    expect(metadataDoc.data()).toEqual(metadata);
  });

  test("should return a non-existent document when no document is found", async () => {
    const randomString = Math.random().toString();
    const metadataDocumentPath = `metadatas/${randomString}`;

    const metadata = {
      collectionName: "nonExistingCollection",
      instanceId: "nonExistingInstance",
      createdAt: Timestamp.now(),
    };

    // Fetch a non-existing document
    const metadataDoc = await getMetadataDoc(metadataDocumentPath, metadata);

    // Assert that the document does not exist
    expect(metadataDoc.exists).toBe(false);
  });

  test("should create a new document if backfill is required", async () => {
    const randomString = Math.random().toString();
    const metadataDocumentPath = `metadatas/${randomString}`;

    const metadata = {
      collectionName: "initialBackfill",
      instanceId: "instanceBackfill",
      createdAt: Timestamp.now(),
    };

    // Mock the backfill function to always return true
    const shouldRunBackfill = async () => true;

    // Update or create the document
    const result = await updateOrCreateMetadataDoc(
      metadataDocumentPath,
      shouldRunBackfill,
      metadata,
    );

    // Fetch the document
    const doc = await admin.firestore().doc(metadataDocumentPath).get();

    // Assertions
    expect(doc.exists).toBeTruthy();
    expect(result.shouldBackfill).toBe(true);
    expect(result.path).toBe(metadataDocumentPath);
    expect(doc.data()).toEqual(metadata);
  });

  test("should not update the document if backfill is not required", async () => {
    const randomString = Math.random().toString();
    const metadataDocumentPath = `metadatas/${randomString}`;

    const initialMetadata = {
      collectionName: "noBackfillInitial",
      instanceId: "noBackfillInstance",
      createdAt: Timestamp.now(),
    };
    const updatedMetadata = {
      collectionName: "noBackfillUpdated",
      instanceId: "noBackfillUpdatedInstance",
      createdAt: Timestamp.now(),
    };

    // Mock the backfill function to always return false
    const shouldRunBackfill = async () => false;

    // Create the initial document
    await createMetadataDoc(metadataDocumentPath, initialMetadata);

    // Try to update the document (should not happen due to backfill check)
    const result = await updateOrCreateMetadataDoc(
      metadataDocumentPath,
      shouldRunBackfill,
      updatedMetadata,
    );

    // Fetch the document
    const doc = await admin.firestore().doc(metadataDocumentPath).get();

    // Assertions
    expect(doc.exists).toBeTruthy();
    expect(result.shouldBackfill).toBe(false);
    expect(doc.data()).toEqual(initialMetadata); // Should not be updated
  });
});
