/* eslint-disable @typescript-eslint/no-explicit-any */

import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import fetch from "node-fetch";
import {
  createMetadataDoc,
  updateMetadataDoc,
  getMetadataDoc,
  updateOrCreateMetadataDoc,
} from "./metadata_document";
import waitForExpect from "wait-for-expect";

global.console.debug = jest.fn(); // silence console.debug

process.env.GCLOUD_PROJECT = "demo-gcp";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";

admin.initializeApp({
  projectId: "demo-gcp",
});

const firestoreObserver = jest.fn((x: any) => {
  console.debug("firestoreObserver", x);
});

describe("createMetadataDoc", () => {
  let unsubscribe: (() => void) | undefined;

  // clear firestore
  beforeEach(async () => {
    await fetch(
      `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-gcp/databases/(default)/documents`,
      { method: "DELETE" }
    );
    jest.clearAllMocks();

    // set up observer on collection
    unsubscribe = admin
      .firestore()
      .collection("metadatas")
      .onSnapshot((snap: any) => {
        /** There is a bug on first init and write, causing the the emulator to the observer is called twice
         * A snapshot is registered on the first run, this affects the observer count
         * This is a workaround to ensure the observer is only called when it should be
         */
        if (snap.docs.length) firestoreObserver(snap);
      });
  });

  afterEach(() => {
    if (unsubscribe && typeof unsubscribe === "function") {
      unsubscribe();
    }
    jest.clearAllMocks();
  });

  test("should create fresh metadata doc", async () => {
    const randomString = Math.random().toString();
    const metadataDocumentPath = `metadatas/${randomString}`;
    const metadata = {
      collectionName: "testCollection",
      instanceId: "testInstance",
      createdAt: Timestamp.now(),
    };

    await createMetadataDoc(metadataDocumentPath, metadata);

    const doc = await admin.firestore().doc(metadataDocumentPath).get();

    expect(doc.exists).toBeTruthy();
    expect(doc.data()).toEqual(metadata);
    expect(firestoreObserver).toHaveBeenCalledTimes(1);
    expect(firestoreObserver.mock.calls[0][0].docs[0].data()).toEqual(metadata);
  });
});

describe("updateMetadataDoc", () => {
  let unsubscribe: (() => void) | undefined;

  // clear firestore
  beforeEach(async () => {
    await fetch(
      `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-gcp/databases/(default)/documents`,
      { method: "DELETE" }
    );
    jest.clearAllMocks();

    // set up observer on collection
    unsubscribe = admin
      .firestore()
      .collection("metadatas")
      .onSnapshot((snap: any) => {
        /** There is a bug on first init and write, causing the the emulator to the observer is called twice
         * A snapshot is registered on the first run, this affects the observer count
         * This is a workaround to ensure the observer is only called when it should be
         */
        if (snap.docs.length) firestoreObserver(snap);
      });
  });

  afterEach(() => {
    if (unsubscribe && typeof unsubscribe === "function") {
      unsubscribe();
    }
    jest.clearAllMocks();
  });

  test("should update an existing metadata doc", async () => {
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
      // Assume createdAt remains unchanged in this scenario
      createdAt: initialMetadata.createdAt,
    };

    // First, create the document to ensure it exists
    await admin.firestore().doc(metadataDocumentPath).set(initialMetadata);

    // Now, update the document
    await updateMetadataDoc(metadataDocumentPath, updatedMetadata);

    const doc = await admin.firestore().doc(metadataDocumentPath).get();

    expect(doc.exists).toBeTruthy();
    expect(doc.data()).toEqual(expect.objectContaining(updatedMetadata));
    expect(firestoreObserver).toHaveBeenCalledTimes(2);
    expect(firestoreObserver.mock.calls[1][0].docs[0].data()).toEqual(
      expect.objectContaining(updatedMetadata)
    );
  });
});

describe("getMetadataDoc", () => {
  let unsubscribe: (() => void) | undefined;

  // clear firestore
  beforeEach(async () => {
    await fetch(
      `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-gcp/databases/(default)/documents`,
      { method: "DELETE" }
    );
    jest.clearAllMocks();

    // set up observer on collection
    unsubscribe = admin
      .firestore()
      .collection("metadatas")
      .onSnapshot((snap: any) => {
        /** There is a bug on first init and write, causing the the emulator to the observer is called twice
         * A snapshot is registered on the first run, this affects the observer count
         * This is a workaround to ensure the observer is only called when it should be
         */
        if (snap.docs.length) firestoreObserver(snap);
      });
  });

  afterEach(() => {
    if (unsubscribe && typeof unsubscribe === "function") {
      unsubscribe();
    }
    jest.clearAllMocks();
  });

  test("should fetch an existing metadata doc", async () => {
    const randomString = Math.random().toString();
    const metadataDocumentPath = `metadatas/${randomString}`;

    const metadata = {
      collectionName: "fetchCollection",
      instanceId: "fetchInstance",
      createdAt: Timestamp.now(),
    };

    // First, create the document to ensure it exists
    await admin.firestore().doc(metadataDocumentPath).set(metadata);

    // Now, fetch the document
    const metadataDoc = await getMetadataDoc(metadataDocumentPath, metadata);

    expect(metadataDoc).not.toBeNull();
    expect(metadataDoc?.exists).toBeTruthy();
    expect(metadataDoc?.data()).toEqual(metadata);
  });

  test("should return null if metadata doc does not exist", async () => {
    const randomString = Math.random().toString();
    const metadataDocumentPath = `metadatas/${randomString}`;

    const metadata = {
      collectionName: "nonExistingCollection",
      instanceId: "nonExistingInstance",
      createdAt: Timestamp.now(),
    };

    // Attempt to fetch a non-existing document
    const metadataDoc = await getMetadataDoc(metadataDocumentPath, metadata);

    expect(metadataDoc).toBeNull();
  });
});

describe("updateOrCreateMetadataDoc", () => {
  let unsubscribe: (() => void) | undefined;

  // clear firestore
  beforeEach(async () => {
    await fetch(
      `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-gcp/databases/(default)/documents`,
      { method: "DELETE" }
    );
    jest.clearAllMocks();

    // set up observer on collection
    unsubscribe = admin
      .firestore()
      .collection("metadatas")
      .onSnapshot((snap: any) => {
        /** There is a bug on first init and write, causing the the emulator to the observer is called twice
         * A snapshot is registered on the first run, this affects the observer count
         * This is a workaround to ensure the observer is only called when it should be
         */
        if (snap.docs.length) firestoreObserver(snap);
      });
  });

  afterEach(() => {
    if (unsubscribe && typeof unsubscribe === "function") {
      unsubscribe();
    }
    jest.clearAllMocks();
  });

  test("should update existing doc if backfill is required", async () => {
    const randomString = Math.random().toString();
    const metadataDocumentPath = `metadatas/${randomString}`;

    const initialMetadata = {
      collectionName: "initialUpdateOrCreate",
      instanceId: "initialInstance",
      createdAt: Timestamp.now(),
    };
    const updatedMetadata = {
      collectionName: "updatedUpdateOrCreate",
      instanceId: "updatedInstance",
      createdAt: Timestamp.now(), // Assume a new timestamp for simplicity
    };

    // Mock the backfill function to always return true
    const shouldRunBackfill = jest.fn().mockResolvedValue(true);

    // First, create the document to ensure it exists
    await admin.firestore().doc(metadataDocumentPath).set(initialMetadata);

    // Now, attempt to update or create the document
    const result = await updateOrCreateMetadataDoc(
      metadataDocumentPath,
      shouldRunBackfill,
      updatedMetadata
    );

    expect(result.shouldBackfill).toBe(true);
    expect(result.path).toBe(metadataDocumentPath);
    expect(shouldRunBackfill).toHaveBeenCalledTimes(1);
    const doc = await admin.firestore().doc(metadataDocumentPath).get();
    expect(doc.data()).toEqual(expect.objectContaining(updatedMetadata));
  });

  test("should create new doc if it does not exist", async () => {
    const randomString = Math.random().toString();
    const metadataDocumentPath = `metadatas/${randomString}`;

    const metadata = {
      collectionName: "newCreateOrUpdate",
      instanceId: "newInstance",
      createdAt: Timestamp.now(),
    };

    // Mock the backfill function to always return true
    const shouldRunBackfill = jest.fn().mockResolvedValue(true);

    // Attempt to update or create the document, expecting creation
    const result = await updateOrCreateMetadataDoc(
      metadataDocumentPath,
      shouldRunBackfill,
      metadata
    );

    expect(result.shouldBackfill).toBe(true);
    expect(result.path).toBe(metadataDocumentPath);
    const doc = await admin.firestore().doc(metadataDocumentPath).get();
    expect(doc.exists).toBeTruthy();
    expect(doc.data()).toEqual(metadata);
  });

  test("should not update existing doc if backfill is not required", async () => {
    const randomString = Math.random().toString();
    const metadataDocumentPath = `metadatas/${randomString}`;

    const initialMetadata = {
      collectionName: "initialNoBackfill",
      instanceId: "initialInstanceNoBackfill",
      createdAt: Timestamp.now(),
    };
    const updatedMetadata = {
      collectionName: "updatedNoBackfill",
      instanceId: "updatedInstanceNoBackfill",
      createdAt: Timestamp.now(), // Assume a new timestamp for simplicity
    };

    // Mock the backfill function to always return false
    const shouldRunBackfill = jest.fn().mockResolvedValue(false);

    // First, create the document to ensure it exists
    await admin.firestore().doc(metadataDocumentPath).set(initialMetadata);

    // Now, attempt to update or create the document, expecting no update due to backfill not required
    const result = await updateOrCreateMetadataDoc(
      metadataDocumentPath,
      shouldRunBackfill,
      updatedMetadata
    );

    await waitForExpect(async () => {
      expect(result.shouldBackfill).toBe(false);
      expect(result.path).toBe(metadataDocumentPath);
      expect(shouldRunBackfill).toHaveBeenCalledTimes(1);
      const doc = await admin.firestore().doc(metadataDocumentPath).get();
      expect(doc.data()).toEqual(expect.objectContaining(initialMetadata));
    });
    // The document should not have been updated
  });
});
