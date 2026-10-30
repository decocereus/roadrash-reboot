import { riderIdAt } from "./state.ts";
import type { RiderId } from "./state.ts";

export const HASH_WORDS = 4;
export const FLOAT_BYTES = 8;
export const FLAG_BYTES = 1;
export const CHOICE_BYTES = 1;
export const COUNT_BYTES = 4;
export const WORD_BYTES = 4;

const UNIT_BYTES = 2;
const NAN_HIGH_WORD = 0x7f_f8_00_00;
const HIGH_WORD_AT = 4;
const NO_RIDER = -1;
const MOST_UNITS = 65_535;

export const cursor = { byte: 0 };

export const refuse = (reason: string): never => {
  throw new RangeError(reason);
};

export const textBytes = (value: string): number =>
  UNIT_BYTES + UNIT_BYTES * value.length;

export const textOrNoneBytes = (value: string | null): number =>
  FLAG_BYTES + (value === null ? 0 : textBytes(value));

export const putFloat = (out: DataView, value: number): void => {
  if (Number.isNaN(value)) {
    out.setUint32(cursor.byte, 0, true);
    out.setUint32(cursor.byte + HIGH_WORD_AT, NAN_HIGH_WORD, true);
  } else {
    out.setFloat64(cursor.byte, value, true);
  }
  cursor.byte += FLOAT_BYTES;
};

export const takeFloat = (from: DataView): number => {
  const value = from.getFloat64(cursor.byte, true);
  cursor.byte += FLOAT_BYTES;
  return value;
};

export const putFlag = (out: DataView, value: boolean): void => {
  out.setUint8(cursor.byte, value ? 1 : 0);
  cursor.byte += FLAG_BYTES;
};

export const takeFlag = (from: DataView): boolean => {
  const value = from.getUint8(cursor.byte);
  cursor.byte += FLAG_BYTES;
  return value === 1;
};

export const putCount = (out: DataView, value: number): void => {
  out.setUint32(cursor.byte, value, true);
  cursor.byte += COUNT_BYTES;
};

export const takeCount = (from: DataView): number => {
  const value = from.getUint32(cursor.byte, true);
  cursor.byte += COUNT_BYTES;
  return value;
};

export const putRiderRef = (out: DataView, value: RiderId | null): void => {
  putFloat(out, value ?? NO_RIDER);
};

export const takeRiderRef = (from: DataView): RiderId | null => {
  const value = takeFloat(from);
  return value < 0 ? null : riderIdAt(value);
};

export const putChoice = <Value extends string>(
  out: DataView,
  values: readonly Value[],
  value: Value
): void => {
  const index = values.indexOf(value);
  if (index === -1) {
    refuse(`A snapshot cannot carry the value ${value}.`);
  }
  out.setUint8(cursor.byte, index);
  cursor.byte += CHOICE_BYTES;
};

export const takeChoice = <Value extends string>(
  from: DataView,
  values: readonly Value[]
): Value => {
  const index = from.getUint8(cursor.byte);
  cursor.byte += CHOICE_BYTES;
  const value = values[index];
  if (value === undefined) {
    return refuse(`A snapshot holds no choice at index ${index}.`);
  }
  return value;
};

export const putText = (out: DataView, value: string): void => {
  if (value.length > MOST_UNITS) {
    refuse(
      `A snapshot carries at most ${MOST_UNITS} code units, and this text has ${value.length}.`
    );
  }
  out.setUint16(cursor.byte, value.length, true);
  cursor.byte += UNIT_BYTES;
  for (let unit = 0; unit < value.length; unit += 1) {
    const point = value.codePointAt(unit) ?? 0;
    if (point > MOST_UNITS) {
      refuse(
        `A snapshot carries one code unit per character, and this text holds the code point ${point}.`
      );
    }
    out.setUint16(cursor.byte, point, true);
    cursor.byte += UNIT_BYTES;
  }
};

export const takeText = (from: DataView): string => {
  const units = from.getUint16(cursor.byte, true);
  cursor.byte += UNIT_BYTES;
  let built = "";
  for (let unit = 0; unit < units; unit += 1) {
    built += String.fromCodePoint(from.getUint16(cursor.byte, true));
    cursor.byte += UNIT_BYTES;
  }
  return built;
};

export const putTextOrNone = (out: DataView, value: string | null): void => {
  putFlag(out, value !== null);
  if (value !== null) {
    putText(out, value);
  }
};

export const takeTextOrNone = (from: DataView): string | null =>
  takeFlag(from) ? takeText(from) : null;
