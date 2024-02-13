# firebase-extension-utilites

## firestore-onwrite-processor

This provides a processor class which you can pass to your firestore onWrite call, and will handle the state of processes on firestore fields for you.

```typescript
import {
  FirestoreOnWriteProcessor,
  FirestoreOnWriteProcess,
} from "../firestore-onwrite-processor";

// this can be async if needed
const processFn = ({ input }) => {
  // do stuff here
  return { output };
};

const myProcess = new FirestoreOnWriteProcess({
  id: "myProcessId",
  fieldDependencyArray: ["input"],
});

const myProcessor = new FirestoreOnWriteProcessor({
  processes: [myProcess],
});

export const myFunction = functions.firestore
  .document(COLLECTION_NAME / { id })
  .onWrite(myProcessor.run);
```

### Used in:

(nda)
