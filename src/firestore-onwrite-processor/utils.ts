import { DocumentSnapshot } from "firebase-functions/v1/firestore";
import { FieldValue, GeoPoint, Timestamp } from "firebase-admin/firestore";
import { Change } from "./types";

export enum ChangeType {
  CREATE = "CREATE",
  UPDATE = "UPDATE",
  DELETE = "DELETE",
}

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
