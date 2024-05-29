/* eslint-disable @typescript-eslint/no-explicit-any */

import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import * as firebaseFunctionsTest from "firebase-functions-test";
import { FirestoreOnWriteProcessor } from ".";
import { Change, firestore } from "firebase-functions";
import { WrappedFunction } from "firebase-functions-test/lib/main";
import { Process } from "../common/process";
import fetch from "node-fetch";
import { FirestoreField } from "./types";

const fft = firebaseFunctionsTest({
  projectId: "demo-gcp",
});
process.env.GCLOUD_PROJECT = "demo-gcp";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";

admin.initializeApp({
  projectId: "demo-gcp",
});

type DocumentReference = admin.firestore.DocumentReference;
type DocumentData = admin.firestore.DocumentData;
type DocumentSnapshot = admin.firestore.DocumentSnapshot<DocumentData>;
type WrappedFirebaseFunction = WrappedFunction<
  Change<firestore.DocumentSnapshot | undefined>
>;

const firestoreObserver = jest.fn((x) => {
  console.debug("firestoreObserver", x);
});
let collectionName: string;

const processFn = ({ input }: Record<string, FirestoreField>) => {
  console.debug("input", input);

  return { output: "foo" };
};

const processes = [
  new Process(processFn, {
    id: "test",
    fieldDependencyArray: ["input"],
  }),
];

const processor = new FirestoreOnWriteProcessor({
  processes: processes,
});

describe("SingleFieldProcessor", () => {
  let unsubscribe: (() => void) | undefined;
  let wrappedGenerateMessage: WrappedFirebaseFunction;
  let docId: string;

  // clear firestore
  beforeEach(async () => {
    collectionName = "test";
    docId = "123";

    await fetch(
      `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-gcp/databases/(default)/documents`,
      { method: "DELETE" }
    );
    jest.clearAllMocks();

    // set up observer on collection
    unsubscribe = admin
      .firestore()
      .collection(collectionName)
      .onSnapshot((snap: admin.firestore.QuerySnapshot) => {
        /** There is a bug on first init and write, causing the emulator observer to be called twice
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

  test("should do noop on empty dependency array", async () => {
    const processFn = ({ input }: Record<string, FirestoreField>) => {
      console.debug("input", input);
      return { output: "foo" };
    };
    const process = new Process(processFn, {
      id: "test",
      fieldDependencyArray: [],
    });

    const processor = new FirestoreOnWriteProcessor({
      processes: [process],
    });

    const testFunction = firestore
      .document(`${collectionName}/${docId}`)
      .onWrite(async (change) => {
        return await processor.run(change);
      });

    wrappedGenerateMessage = fft.wrap(testFunction) as WrappedFirebaseFunction;

    const data = {
      input: "test",
    };

    const ref = await admin.firestore().collection(collectionName).add(data);

    await simulateFunctionTriggered(wrappedGenerateMessage)(ref);

    expect(firestoreObserver).toHaveBeenCalledTimes(1);
  });

  test("should do noop on should not process array", async () => {
    const processFn = ({ input }: Record<string, FirestoreField>) => {
      console.debug("input", input);
      return { output: "foo" };
    };
    const process = new Process(processFn, {
      id: "test",
      fieldDependencyArray: ["test"],
      shouldProcess: () => false,
    });

    const processor = new FirestoreOnWriteProcessor({
      processes: [process],
    });

    const testFunction = firestore
      .document(`${collectionName}/${docId}`)
      .onWrite(async (change) => {
        return await processor.run(change);
      });

    wrappedGenerateMessage = fft.wrap(testFunction) as WrappedFirebaseFunction;

    const data = {
      input: "test",
    };

    const ref = await admin.firestore().collection(collectionName).add(data);

    await new Promise((resolve) => {
      setTimeout(() => {
        resolve(true);
      }, 1000);
    });

    await simulateFunctionTriggered(wrappedGenerateMessage)(ref);

    expect(firestoreObserver).toHaveBeenCalledTimes(1);
  });

  test("should run when not given order field", async () => {
    const testFunction = firestore
      .document(`${collectionName}/${docId}`)
      .onWrite(async (change) => {
        return await processor.run(change);
      });

    wrappedGenerateMessage = fft.wrap(testFunction) as WrappedFirebaseFunction;

    const data = {
      input: "test",
    };
    const ref = await admin.firestore().collection(collectionName).add(data);

    await simulateFunctionTriggered(wrappedGenerateMessage)(ref);
    // we expect the firestore observer to be called 4 times total.
    expect(firestoreObserver).toHaveBeenCalledTimes(3);
    const firestoreCallData = firestoreObserver.mock.calls.map(
      (call: { docs: { data: () => any }[] }[]) => call[0].docs[0].data()
    );

    expect(firestoreCallData[0]).toEqual({ input: "test" });
    expect(firestoreCallData[1]).toEqual({
      input: "test",
      createTime: expect.any(Timestamp),
      status: {
        test: {
          state: "PROCESSING",
          startTime: expect.any(Timestamp),
          updateTime: expect.any(Timestamp),
        },
      },
    });
    expect(firestoreCallData[1].status.test.startTime).toEqual(
      firestoreCallData[1].status.test.updateTime
    );
    const createTime = firestoreCallData[1].createTime;
    expect(firestoreCallData[2]).toEqual({
      input: "test",
      output: "foo",
      createTime,
      status: {
        test: {
          state: "COMPLETED",
          updateTime: expect.any(Timestamp),
          completeTime: expect.any(Timestamp),
          startTime: expect.any(Timestamp),
        },
      },
    });
    expect(firestoreCallData[2]).toHaveProperty("createTime", createTime);
    expect(firestoreCallData[2].status.test.updateTime).toEqual(
      firestoreCallData[2].status.test.completeTime
    );
  });

  test("should run when given order field", async () => {
    const testFunction = firestore
      .document(`${collectionName}/${docId}`)
      .onWrite(async (change) => {
        return await processor.run(change);
      });

    wrappedGenerateMessage = fft.wrap(testFunction) as WrappedFirebaseFunction;

    const customCreateTime = new Date().toISOString();
    const data = {
      input: "test",
      createTime: customCreateTime,
    };

    const ref = await admin.firestore().collection(collectionName).add(data);

    await simulateFunctionTriggered(wrappedGenerateMessage)(ref);
    // we expect the firestore observer to be called 4 times total.
    expect(firestoreObserver).toHaveBeenCalledTimes(3);
    const firestoreCallData = firestoreObserver.mock.calls.map(
      (call: { docs: { data: () => any }[] }[]) => call[0].docs[0].data()
    );

    expect(firestoreCallData[0]).toEqual({
      input: "test",
      createTime: customCreateTime,
    });

    expect(firestoreCallData[1]).toEqual({
      input: "test",
      createTime: customCreateTime,
      status: {
        test: {
          state: "PROCESSING",
          startTime: expect.any(Timestamp),
          updateTime: expect.any(Timestamp),
        },
      },
    });
    expect(firestoreCallData[1].status.startTime).toEqual(
      firestoreCallData[1].status.updateTime
    );
    expect(firestoreCallData[2]).toEqual({
      input: "test",
      output: "foo",
      createTime: customCreateTime,
      status: {
        test: {
          state: "COMPLETED",
          updateTime: expect.any(Timestamp),
          completeTime: expect.any(Timestamp),
          startTime: expect.any(Timestamp),
        },
      },
    });
    expect(firestoreCallData[2].status.updateTime).toEqual(
      firestoreCallData[2].status.completeTime
    );
  });

  test("should run multiple processes fine on same field", async () => {
    const firstProcessFn = ({ input }: Record<string, FirestoreField>) => {
      console.debug("firstProcessFn input", input);
      return { firstOutput: "processed by first process" };
    };

    // Add a second process function
    const secondProcessFn = ({ input }: Record<string, FirestoreField>) => {
      console.debug("secondProcessFn input", input);
      return { secondOutput: "processed by second process" };
    };

    const processes = [
      new Process(firstProcessFn, {
        id: "test",
        fieldDependencyArray: ["input"],
      }),
      new Process(secondProcessFn, {
        id: "secondTest",
        fieldDependencyArray: ["input"],
      }),
    ];

    const processor = new FirestoreOnWriteProcessor({
      processes: processes,
    });

    const testFunction = firestore
      .document(`${collectionName}/${docId}`)
      .onWrite(async (change) => {
        return await processor.run(change);
      });

    wrappedGenerateMessage = fft.wrap(testFunction) as WrappedFirebaseFunction;

    // Define data that triggers both processes
    const data = {
      input: "test",
    };

    // Add the data to Firestore
    const ref = await admin.firestore().collection(collectionName).add(data);

    // Trigger the wrapped function
    await simulateFunctionTriggered(wrappedGenerateMessage)(ref);

    // Expect the firestore observer to be called a specific number of times

    expect(firestoreObserver).toHaveBeenCalledTimes(3);

    // Fetch the updated document and verify outputs of both processes
    const updatedDoc = await admin
      .firestore()
      .collection(collectionName)
      .doc(ref.id)
      .get();
    const updatedData = updatedDoc.data();
    expect(updatedData).toBeDefined();

    expect(updatedData).toHaveProperty(
      "firstOutput",
      "processed by first process"
    ); // Output from the first process
    expect(updatedData).toHaveProperty(
      "secondOutput",
      "processed by second process"
    ); // Output from the second process

    // Verify status updates for both processes
    expect(updatedData?.status.test.state).toEqual("COMPLETED");
    expect(updatedData?.status.secondTest.state).toEqual("COMPLETED");
  });

  test("should run multiple processes on different field", async () => {
    const firstProcessFn = ({ input2 }: Record<string, FirestoreField>) => {
      console.debug("firstProcessFn input2", input2);
      return { firstOutput: "processed by first process" };
    };

    // Add a second process function
    const secondProcessFn = ({ input2 }: Record<string, FirestoreField>) => {
      console.debug("secondProcessFn input2", input2);
      return { secondOutput: "processed by second process" };
    };

    const processes = [
      new Process(firstProcessFn, {
        id: "test",
        fieldDependencyArray: ["input1"],
      }),
      new Process(secondProcessFn, {
        id: "secondTest",
        fieldDependencyArray: ["input2"],
      }),
    ];

    const processor = new FirestoreOnWriteProcessor({
      processes: processes,
    });

    const testFunction = firestore
      .document(`${collectionName}/${docId}`)
      .onWrite(async (change) => {
        return await processor.run(change);
      });

    wrappedGenerateMessage = fft.wrap(testFunction) as WrappedFirebaseFunction;

    // Define data that triggers both processes
    const data = {
      input1: "test",
      input2: "test",
    };

    // Add the data to Firestore
    const ref = await admin.firestore().collection(collectionName).add(data);

    // Trigger the wrapped function
    await simulateFunctionTriggered(wrappedGenerateMessage)(ref);

    // Expect the firestore observer to be called a specific number of times

    expect(firestoreObserver).toHaveBeenCalledTimes(3);

    // Fetch the updated document and verify outputs of both processes
    const updatedDoc = await admin
      .firestore()
      .collection(collectionName)
      .doc(ref.id)
      .get();
    const updatedData = updatedDoc.data();
    expect(updatedData).toBeDefined();

    expect(updatedData).toHaveProperty(
      "firstOutput",
      "processed by first process"
    ); // Output from the first process
    expect(updatedData).toHaveProperty(
      "secondOutput",
      "processed by second process"
    ); // Output from the second process

    // Verify status updates for both processes
    expect(updatedData?.status.test.state).toEqual("COMPLETED");
    expect(updatedData?.status.secondTest.state).toEqual("COMPLETED");
  });

  test("should only run one process if only that field is present", async () => {
    const firstProcessFn = ({ input2 }: Record<string, FirestoreField>) => {
      console.debug("firstProcessFn input2", input2);
      return { firstOutput: "processed by first process" };
    };

    // Add a second process function
    const secondProcessFn = ({ input2 }: Record<string, FirestoreField>) => {
      console.debug("secondProcessFn input2", input2);
      return { secondOutput: "processed by second process" };
    };

    const processes = [
      new Process(firstProcessFn, {
        id: "test",
        fieldDependencyArray: ["input1"],
      }),
      new Process(secondProcessFn, {
        id: "secondTest",
        fieldDependencyArray: ["input2"],
      }),
    ];

    const processor = new FirestoreOnWriteProcessor({
      processes: processes,
    });

    const testFunction = firestore
      .document(`${collectionName}/${docId}`)
      .onWrite(async (change) => {
        return await processor.run(change);
      });

    wrappedGenerateMessage = fft.wrap(testFunction) as WrappedFirebaseFunction;

    // Define data that triggers both processes
    const data = {
      input1: "test",
    };

    // Add the data to Firestore
    const ref = await admin.firestore().collection(collectionName).add(data);

    // Trigger the wrapped function
    await simulateFunctionTriggered(wrappedGenerateMessage)(ref);

    // Expect the firestore observer to be called a specific number of times

    expect(firestoreObserver).toHaveBeenCalledTimes(3);

    // Fetch the updated document and verify outputs of both processes
    const updatedDoc = await admin
      .firestore()
      .collection(collectionName)
      .doc(ref.id)
      .get();
    const updatedData = updatedDoc.data();
    expect(updatedData).toBeDefined();
    expect(updatedData).toHaveProperty(
      "firstOutput",
      "processed by first process"
    );
    expect(updatedData).not.toHaveProperty("secondOutput");
    expect(updatedData?.status).not.toHaveProperty("secondTest");
    // Verify status updates for both processes
    expect(updatedData?.status.test.state).toEqual("COMPLETED");
  });

  test("should gracefully handle an errored process", async () => {
    const processFn = () => {
      throw new Error("Test Error");
    };
    const process = new Process(processFn, {
      id: "testProcess",
      fieldDependencyArray: ["input"],
    });

    const processor = new FirestoreOnWriteProcessor({
      processes: [process],
    });

    const testFunction = firestore
      .document(`${collectionName}/${docId}`)
      .onWrite(async (change) => {
        return await processor.run(change);
      });

    wrappedGenerateMessage = fft.wrap(testFunction) as WrappedFirebaseFunction;

    const data = {
      input: "test",
    };
    const ref = await admin.firestore().collection(collectionName).add(data);

    await simulateFunctionTriggered(wrappedGenerateMessage)(ref);

    // expect(processFn).toHaveBeenCalledWith(data);
    // expect(errorFn).toHaveBeenCalled();
  });

  for (let i = 1; i < 11; i++) {
    test(`should run ${i} different processes fine`, async () => {
      const processes = Array.from({ length: i }, (_, index) => {
        return new Process(
          (data) => {
            console.debug("data", data);
            return { [`output_${index}`]: `processed by process ${index}` };
          },
          {
            id: `test_${index}`,
            fieldDependencyArray: [`input_${index}`],
          }
        );
      });

      const processor = new FirestoreOnWriteProcessor({
        processes: processes,
      });

      const testFunction = firestore
        .document(`${collectionName}/${docId}`)
        .onWrite(async (change) => {
          return await processor.run(change);
        });

      wrappedGenerateMessage = fft.wrap(
        testFunction
      ) as WrappedFirebaseFunction;

      // Define data that triggers all processes
      const data: { [key: string]: string } = {};

      for (let index = 0; index < i; index++) {
        data[`input_${index}`] = `test${index}`;
      }

      // Add the data to Firestore
      const ref = await admin.firestore().collection(collectionName).add(data);

      // Trigger the wrapped function
      await simulateFunctionTriggered(wrappedGenerateMessage)(ref);

      // Expect the firestore observer to be called a specific number of times

      expect(firestoreObserver).toHaveBeenCalledTimes(3);

      // Fetch the updated document and verify outputs of all processes
      const updatedDoc = await admin
        .firestore()
        .collection(collectionName)
        .doc(ref.id)
        .get();
      const updatedData = updatedDoc.data();
      expect(updatedData).toBeDefined();

      for (let index = 0; index < i; index++) {
        expect(updatedData).toHaveProperty(
          `output_${index}`,
          `processed by process ${index}`
        );
      }

      // Verify status updates for all processes
      for (let index = 0; index < i; index++) {
        expect(updatedData?.status[`test_${index}`].state).toEqual("COMPLETED");
      }
    });
  }
});

const simulateFunctionTriggered =
  (wrappedFunction: WrappedFirebaseFunction) =>
  async (ref: DocumentReference, before?: DocumentSnapshot) => {
    const data = (await ref.get()).data() as { [key: string]: unknown };
    const beforeFunctionExecution = fft.firestore.makeDocumentSnapshot(
      data,
      `${collectionName}/${ref.id}`
    ) as DocumentSnapshot;
    const change = fft.makeChange(before, beforeFunctionExecution);
    await wrappedFunction(change);
    return beforeFunctionExecution;
  };
