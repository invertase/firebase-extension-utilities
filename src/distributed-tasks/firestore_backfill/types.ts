export interface FirestoreBackfillOptions {
  queueName: string;
  metadataDocumentPath: string;
  shouldDoBackfill: (data: Record<string, any>) => Promise<boolean>;
  extensionInstanceId?: string;
}
