# firebase-extension-utilites

## firestore-onwrite-processor

This provides a processor class which you can pass to your firestore onWrite call, and will handle the state of processes on firestore fields for you.

```typescript
import {
  FirestoreOnWriteProcessor,
  FirestoreOnWriteProcess,
} from "firebase-extension-utilities/firestore-onwrite-processor";

const myProcess = new FirestoreOnWriteProcess({
  id: "myProcessId",
  fieldDependencyArray: ["input"],
  processFn: ({ input }) => {
    // do stuff here
    return { output };
  },
});

const myProcessor = new FirestoreOnWriteProcessor({
  processes: [myProcess],
});

export const myFunction = functions.firestore
  .document(COLLECTION_NAME / { id })
  .onWrite(process);
```

### TODO:

- change signature of above, process function should be main argument and then should pass `options` which include optional id etc.

### Used in:

(nda)
## distributed-cloud-tasks

**(TODO)**
