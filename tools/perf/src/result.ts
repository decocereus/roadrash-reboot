import { createHash } from "node:crypto";
import type { Hash } from "node:crypto";

import * as Predicate from "effect/Predicate";

const numberText = (value: number): string =>
  Object.is(value, -0) ? "n-0" : `n${String(value)}`;

const feed = (hash: Hash, holder: readonly unknown[], at: number): void => {
  const value = holder[at];
  if (Predicate.isNumber(value)) {
    hash.update(numberText(value));
  } else if (Predicate.isString(value)) {
    hash.update(`s${value.length}:${value}`);
  } else if (Predicate.isBoolean(value)) {
    hash.update(value ? "t" : "f");
  } else if (Predicate.isNull(value)) {
    hash.update("z");
  } else if (Predicate.isUndefined(value)) {
    hash.update("u");
  } else if (ArrayBuffer.isView(value)) {
    hash.update(`v${value.constructor.name}:${value.byteLength}:`);
    hash.update(
      new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    );
  } else if (Array.isArray(value)) {
    const items: readonly unknown[] = value;
    hash.update(`a${items.length}:`);
    for (let index = 0; index < items.length; index += 1) {
      feed(hash, items, index);
    }
  } else if (
    Predicate.isReadonlyObject(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    const keys = Object.keys(value).toSorted();
    hash.update(`o${keys.length}:`);
    const values = keys.map((key) => value[key]);
    for (const [index, key] of keys.entries()) {
      hash.update(`s${key.length}:${key}`);
      feed(hash, values, index);
    }
  } else {
    throw new TypeError("The perf digest reads plain data only.");
  }
};

export const digestOf = (...values: readonly unknown[]): string => {
  const hash = createHash("sha256");
  feed(hash, [values], 0);
  return hash.digest("hex");
};
