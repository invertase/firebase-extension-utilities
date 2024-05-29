/* eslint-disable @typescript-eslint/no-explicit-any */

import { FirestoreField } from "../../common/types";

export interface FirestoreBackfillOptions {
  queueName: string;
  metadataDocumentPath: string;
  collectionName: string;
  // TODO: remove any
  shouldDoBackfill: (data: Record<string, any>) => Promise<boolean>;
  extensionInstanceId?: string;
  metadata?: Record<string, FirestoreField>;
}
