import {
  CHOICE_BYTES,
  COUNT_BYTES,
  FLAG_BYTES,
  FLOAT_BYTES,
  putChoice,
  putCount,
  putFlag,
  putFloat,
  putRiderRef,
  putText,
  putTextOrNone,
  refuse,
  takeChoice,
  takeCount,
  takeFlag,
  takeFloat,
  takeRiderRef,
  takeText,
  takeTextOrNone,
  textBytes,
  textOrNoneBytes,
} from "./snapshot-bytes.ts";
import type { RiderId } from "./state.ts";

export interface FloatRun {
  readonly length: number;
  readonly [index: number]: number;
}

export interface Writer<Read, Key extends PropertyKey> {
  readonly key: Key;
  readonly bytes: (value: Read) => number;
  readonly put: (out: DataView, value: Read) => void;
}

export interface Member<Read, Write, Key extends PropertyKey> extends Writer<
  Read,
  Key
> {
  readonly take: (from: DataView, value: Write) => void;
}

type Merged<Value> = (
  Value extends object ? (only: Value) => void : never
) extends (only: infer Single) => void
  ? Single
  : never;

type OneRecord<Value> = [Value] extends [Merged<Value>] ? object : never;

export type Fields<Read, Write> = OneRecord<Write> & {
  readonly [Key in keyof Write]-?: Member<Read, Write, Key>;
};

export type WrittenFields<Read> = OneRecord<Read> & {
  readonly [Key in keyof Read]-?: Writer<Read, Key>;
};

export interface WrittenSchema<Read> {
  readonly writers: readonly Writer<Read, PropertyKey>[];
}

export interface Schema<Read, Write> extends WrittenSchema<Read> {
  readonly members: readonly Member<Read, Write, PropertyKey>[];
}

export const schemaOf = <Read, Write>(
  fields: Fields<Read, Write>
): Schema<Read, Write> => {
  const members = Object.values<Member<Read, Write, PropertyKey>>(fields);
  return { members, writers: members };
};

export const writtenSchemaOf = <Read>(
  fields: WrittenFields<Read>
): WrittenSchema<Read> => ({
  writers: Object.values<Writer<Read, PropertyKey>>(fields),
});

export const bytesOf = <Read>(
  schema: WrittenSchema<Read>,
  value: Read
): number => {
  let total = 0;
  for (const writer of schema.writers) {
    total += writer.bytes(value);
  }
  return total;
};

export const putRecord = <Read>(
  out: DataView,
  schema: WrittenSchema<Read>,
  value: Read
): void => {
  for (const writer of schema.writers) {
    writer.put(out, value);
  }
};

export const takeRecord = <Read, Write>(
  from: DataView,
  schema: Schema<Read, Write>,
  value: Write
): void => {
  for (const member of schema.members) {
    member.take(from, value);
  }
};

const sameCount = (from: DataView, live: number, what: string): void => {
  const count = takeCount(from);
  if (count !== live) {
    refuse(`This snapshot holds ${count} ${what} and the race has ${live}.`);
  }
};

export const floatAt = <Key extends string>(
  key: Key
): Member<Readonly<Record<Key, number>>, Record<Key, number>, Key> => ({
  key,
  bytes: () => FLOAT_BYTES,
  put: (out, value) => {
    putFloat(out, value[key]);
  },
  take: (from, value) => {
    value[key] = takeFloat(from);
  },
});

export const flagAt = <Key extends string>(
  key: Key
): Member<Readonly<Record<Key, boolean>>, Record<Key, boolean>, Key> => ({
  key,
  bytes: () => FLAG_BYTES,
  put: (out, value) => {
    putFlag(out, value[key]);
  },
  take: (from, value) => {
    value[key] = takeFlag(from);
  },
});

export const choiceAt = <Key extends string, Choice extends string>(
  key: Key,
  values: readonly [Choice, ...Choice[]]
): Member<Readonly<Record<Key, Choice>>, Record<Key, Choice>, Key> => ({
  key,
  bytes: () => CHOICE_BYTES,
  put: (out, value) => {
    putChoice(out, values, value[key]);
  },
  take: (from, value) => {
    value[key] = takeChoice(from, values);
  },
});

export const riderRefAt = <Key extends string>(
  key: Key
): Member<
  Readonly<Record<Key, RiderId | null>>,
  Record<Key, RiderId | null>,
  Key
> => ({
  key,
  bytes: () => FLOAT_BYTES,
  put: (out, value) => {
    putRiderRef(out, value[key]);
  },
  take: (from, value) => {
    value[key] = takeRiderRef(from);
  },
});

export const riderAt = <Key extends string>(
  key: Key
): Member<Readonly<Record<Key, RiderId>>, Record<Key, RiderId>, Key> => ({
  key,
  bytes: () => FLOAT_BYTES,
  put: (out, value) => {
    putRiderRef(out, value[key]);
  },
  take: (from, value) => {
    const id = takeRiderRef(from);
    if (id === null) {
      refuse("A snapshot holds an event with no rider.");
      return;
    }
    value[key] = id;
  },
});

export const textAt = <Key extends string>(
  key: Key
): Member<Readonly<Record<Key, string>>, Record<Key, string>, Key> => ({
  key,
  bytes: (value) => textBytes(value[key]),
  put: (out, value) => {
    putText(out, value[key]);
  },
  take: (from, value) => {
    value[key] = takeText(from);
  },
});

export const textOrNoneAt = <Key extends string>(
  key: Key
): Member<
  Readonly<Record<Key, string | null>>,
  Record<Key, string | null>,
  Key
> => ({
  key,
  bytes: (value) => textOrNoneBytes(value[key]),
  put: (out, value) => {
    putTextOrNone(out, value[key]);
  },
  take: (from, value) => {
    value[key] = takeTextOrNone(from);
  },
});

export const floatsAt = <Key extends string>(
  key: Key
): Member<Readonly<Record<Key, FloatRun>>, Record<Key, number[]>, Key> => ({
  key,
  bytes: (value) => COUNT_BYTES + FLOAT_BYTES * value[key].length,
  put: (out, value) => {
    const list = value[key];
    const count = list.length;
    putCount(out, count);
    for (let index = 0; index < count; index += 1) {
      putFloat(out, list[index] ?? 0);
    }
  },
  take: (from, value) => {
    const count = takeCount(from);
    const list = value[key];
    list.length = count;
    for (let index = 0; index < count; index += 1) {
      list[index] = takeFloat(from);
    }
  },
});

export const blockAt = <Key extends string>(
  key: Key,
  length: number
): Member<
  Readonly<Record<Key, FloatRun>>,
  Readonly<Record<Key, Float64Array>>,
  Key
> => ({
  key,
  bytes: () => FLOAT_BYTES * length,
  put: (out, value) => {
    const block = value[key];
    for (let index = 0; index < length; index += 1) {
      putFloat(out, block[index] ?? 0);
    }
  },
  take: (from, value) => {
    const block = value[key];
    for (let index = 0; index < length; index += 1) {
      block[index] = takeFloat(from);
    }
  },
});

export const samplesAt = <Key extends string>(
  key: Key
): Writer<Readonly<Record<Key, FloatRun>>, Key> => ({
  key,
  bytes: (value) => COUNT_BYTES + FLOAT_BYTES * value[key].length,
  put: (out, value) => {
    const block = value[key];
    const count = block.length;
    putCount(out, count);
    for (let index = 0; index < count; index += 1) {
      putFloat(out, block[index] ?? 0);
    }
  },
});

export const recordAt = <Key extends string, Read, Write>(
  key: Key,
  schema: Schema<Read, Write>
): Member<Readonly<Record<Key, Read>>, Readonly<Record<Key, Write>>, Key> => ({
  key,
  bytes: (value) => bytesOf(schema, value[key]),
  put: (out, value) => {
    putRecord(out, schema, value[key]);
  },
  take: (from, value) => {
    takeRecord(from, schema, value[key]);
  },
});

export const writtenRecordAt = <Key extends string, Read>(
  key: Key,
  schema: WrittenSchema<Read>
): Writer<Readonly<Record<Key, Read>>, Key> => ({
  key,
  bytes: (value) => bytesOf(schema, value[key]),
  put: (out, value) => {
    putRecord(out, schema, value[key]);
  },
});

export const listAt = <Key extends string, Read, Write>(
  key: Key,
  schema: Schema<Read, Write>
): Member<
  Readonly<Record<Key, readonly Read[]>>,
  Readonly<Record<Key, readonly Write[]>>,
  Key
> => ({
  key,
  bytes: (value) => {
    let total = COUNT_BYTES;
    for (const item of value[key]) {
      total += bytesOf(schema, item);
    }
    return total;
  },
  put: (out, value) => {
    putCount(out, value[key].length);
    for (const item of value[key]) {
      putRecord(out, schema, item);
    }
  },
  take: (from, value) => {
    sameCount(from, value[key].length, key);
    for (const item of value[key]) {
      takeRecord(from, schema, item);
    }
  },
});

export const writtenListAt = <Key extends string, Read>(
  key: Key,
  schema: WrittenSchema<Read>
): Writer<Readonly<Record<Key, readonly Read[]>>, Key> => ({
  key,
  bytes: (value) => {
    let total = COUNT_BYTES;
    for (const item of value[key]) {
      total += bytesOf(schema, item);
    }
    return total;
  },
  put: (out, value) => {
    putCount(out, value[key].length);
    for (const item of value[key]) {
      putRecord(out, schema, item);
    }
  },
});

export const filledListAt = <Key extends string, Read, Write>(
  key: Key,
  schema: Schema<Read, Write>,
  blank: () => Write
): Member<
  Readonly<Record<Key, readonly Read[]>>,
  Readonly<Record<Key, Write[]>>,
  Key
> => ({
  key,
  bytes: (value) => {
    let total = COUNT_BYTES;
    for (const item of value[key]) {
      total += bytesOf(schema, item);
    }
    return total;
  },
  put: (out, value) => {
    putCount(out, value[key].length);
    for (const item of value[key]) {
      putRecord(out, schema, item);
    }
  },
  take: (from, value) => {
    const list = value[key];
    const count = takeCount(from);
    for (let index = 0; index < count; index += 1) {
      const live = list[index] ?? blank();
      takeRecord(from, schema, live);
      list[index] = live;
    }
    list.length = count;
  },
});
