import {
  ChangeType,
  getChangeType,
  isDelete,
  isUpdate,
  isCreate,
} from "./utils";
import { Change } from "./types";
describe("Utility Functions", () => {
  // Mock Change object for CREATE scenario
  const createChange = {
    before: { exists: false },
    after: { exists: true },
  } as Change;

  // Mock Change object for DELETE scenario
  const deleteChange = {
    before: { exists: true },
    after: { exists: false },
  } as Change;

  // Mock Change object for UPDATE scenario
  const updateChange = {
    before: { exists: true },
    after: { exists: true },
  } as Change;

  test("getChangeType should identify CREATE", () => {
    expect(getChangeType(createChange)).toBe(ChangeType.CREATE);
  });

  test("getChangeType should identify DELETE", () => {
    expect(getChangeType(deleteChange)).toBe(ChangeType.DELETE);
  });

  test("getChangeType should identify UPDATE", () => {
    expect(getChangeType(updateChange)).toBe(ChangeType.UPDATE);
  });

  test("isDelete should correctly identify DELETE changes", () => {
    expect(isDelete(deleteChange)).toBeTruthy();
    expect(isDelete(createChange)).toBeFalsy();
    expect(isDelete(updateChange)).toBeFalsy();
  });

  test("isUpdate should correctly identify UPDATE changes", () => {
    expect(isUpdate(updateChange)).toBeTruthy();
    expect(isUpdate(createChange)).toBeFalsy();
    expect(isUpdate(deleteChange)).toBeFalsy();
  });

  test("isCreate should correctly identify CREATE changes", () => {
    expect(isCreate(createChange)).toBeTruthy();
    expect(isCreate(updateChange)).toBeFalsy();
    expect(isCreate(deleteChange)).toBeFalsy();
  });
});
