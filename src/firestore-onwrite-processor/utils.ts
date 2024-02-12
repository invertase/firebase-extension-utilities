import { Change as FirestoreChange } from "firebase-functions/v1";
import { DocumentSnapshot } from "firebase-functions/v1/firestore";
import { FieldValue, GeoPoint, Timestamp } from "firebase-admin/firestore";
export type Change = FirestoreChange<DocumentSnapshot>;

export enum ChangeType {
  CREATE = "CREATE",
  UPDATE = "UPDATE",
  DELETE = "DELETE",
}

export enum State {
  PROCESSING = "PROCESSING",
  COMPLETED = "COMPLETED",
  ERROR = "ERROR",
}

export interface Status {
  state: State;
  updateTime: Timestamp;
  startTime: Timestamp;
}

type StatusMap = Record<string, Status>;

type FirestoreFieldPrimitive =
  | string
  | number
  | boolean
  | FieldValue
  | Timestamp
  | GeoPoint
  | undefined // i dont think we can actually try to update with an undefined, we have to use the FieldValue.delete() or something
  | null;

type ValueOrMapOrArray<T> =
  | T
  | { [key: string]: ValueOrMapOrArray<T> | T }
  | Array<ValueOrMapOrArray<T>>;

// TODO missing reference type
export type FirestoreField = ValueOrMapOrArray<FirestoreFieldPrimitive>;

export const now = () => FieldValue.serverTimestamp();

export const getChangeType = (change: Change) => {
  if (!change.before || !change.before.exists) {
    return ChangeType.CREATE;
  }
  if (!change.after || !change.after.exists) {
    return ChangeType.DELETE;
  }
  return ChangeType.UPDATE;
};

export const isDelete = (change: Change) =>
  getChangeType(change) === ChangeType.DELETE;

export const isUpdate = (change: Change) =>
  getChangeType(change) === ChangeType.UPDATE;

export const isCreate = (change: Change) =>
  getChangeType(change) === ChangeType.CREATE;
