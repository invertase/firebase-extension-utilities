import { FirestoreField } from "../../common/types";

export interface FirestoreBackfillOptions {
  queueName: string;
  metadataDocumentPath: string;
  collectionName: string;
  shouldDoBackfill: (data: Record<string, any>) => Promise<boolean>;
  extensionInstanceId?: string;
  metadata?: Record<string, FirestoreField>;
  statusField: string;
}
