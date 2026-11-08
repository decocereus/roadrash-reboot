import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

import { problemOf } from "./save-invariants.ts";
import { firstField, issuePaths } from "./save-issues.ts";
import {
  EncodedSaveSchema,
  SaveSourceSchema,
  VersionSixSaveSchema,
} from "./save-schema.ts";
import type { SaveError } from "./save-schema.ts";
import {
  blankMemory,
  blankSeason,
  byRacer,
  byRival,
  SAVE_VERSION,
} from "./state.ts";
import type { CareerState } from "./state.ts";

export type SaveResult =
  | { readonly ok: true; readonly career: CareerState }
  | { readonly ok: false; readonly error: SaveError };

const RawSaveSchema = Schema.Record(Schema.String, Schema.Unknown);

const decodeText = Schema.decodeUnknownResult(
  Schema.fromJsonString(RawSaveSchema)
);
const decodeSave = Schema.decodeUnknownResult(EncodedSaveSchema, {
  errors: "all",
});
const decodeVersionSix = Schema.decodeUnknownResult(VersionSixSaveSchema, {
  errors: "all",
});
const decodeSources = Schema.decodeUnknownResult(SaveSourceSchema, {
  errors: "all",
});

type RawSave = typeof RawSaveSchema.Type;
type EncodedSave = typeof EncodedSaveSchema.Type;

const refused = (kind: SaveError["kind"], field: string): SaveResult => ({
  error: { field, kind },
  ok: false,
});

const loaded = (career: CareerState): SaveResult => {
  const problem = problemOf(career);
  return problem === null
    ? { career, ok: true }
    : { error: problem, ok: false };
};

const withEveryRacer = (save: EncodedSave): CareerState => ({
  ...save,
  memory: byRival((rival) => save.memory[rival] ?? blankMemory),
  season: byRacer((racer) => save.season[racer] ?? blankSeason),
});

const fromVersionSix = (
  save: typeof VersionSixSaveSchema.Type
): EncodedSave => ({
  ...save,
  season: byRacer((racer) => {
    const entry = save.season[racer];
    return entry === undefined
      ? blankSeason
      : { ...entry, bestPlace: entry.wins > 0 ? 1 : null };
  }),
  version: SAVE_VERSION,
});

const readSave =
  <Save>(
    decode: (save: RawSave) => Result.Result<Save, Schema.SchemaError>,
    careerOf: (save: Save) => CareerState
  ) =>
  (save: RawSave): SaveResult => {
    const sources = Result.match(decodeSources(save), {
      onFailure: issuePaths,
      onSuccess: () => [],
    });
    return Result.match(decode(save), {
      onFailure: (error) =>
        refused("invalid", firstField([...issuePaths(error), ...sources])),
      onSuccess: (decoded) =>
        sources.length > 0
          ? refused("invalid", firstField(sources))
          : loaded(careerOf(decoded)),
    });
  };

const readers = new Map<unknown, (save: RawSave) => SaveResult>([
  [
    EncodedSaveSchema.fields.version.literal,
    readSave(decodeSave, withEveryRacer),
  ],
  [
    VersionSixSaveSchema.fields.version.literal,
    readSave(decodeVersionSix, (save) => withEveryRacer(fromVersionSix(save))),
  ],
]);

const decode = (text: string): SaveResult =>
  Result.match(decodeText(text), {
    onFailure: () => refused("notJson", ""),
    onSuccess: (save) =>
      readers.get(save.version)?.(save) ?? refused("wrongVersion", "version"),
  });

export const serialiseCareer = (career: CareerState): string => {
  const save: EncodedSave = career;
  return JSON.stringify(save);
};

export const parseCareer = (text: string): SaveResult => {
  try {
    return decode(text);
  } catch {
    return refused("invalid", "");
  }
};
