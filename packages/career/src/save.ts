import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

import type { RaceRules } from "./rules.ts";
import { problemOf } from "./save-invariants.ts";
import { firstField, issuePaths } from "./save-issues.ts";
import { EncodedSaveSchema, SaveSourceSchema } from "./save-schema.ts";
import type { SaveError } from "./save-schema.ts";
import { SAVE_VERSION } from "./state.ts";
import type { CareerState } from "./state.ts";

export type SaveResult =
  | { readonly ok: true; readonly career: CareerState }
  | { readonly ok: false; readonly error: SaveError };

const RawSave = Schema.Record(Schema.String, Schema.Unknown);

const decodeText = Schema.decodeUnknownResult(Schema.fromJsonString(RawSave));
const decodeSave = Schema.decodeUnknownResult(EncodedSaveSchema, {
  errors: "all",
});
const decodeSources = Schema.decodeUnknownResult(SaveSourceSchema, {
  errors: "all",
});

const refused = (kind: SaveError["kind"], field: string): SaveResult => ({
  error: { field, kind },
  ok: false,
});

const loaded = (career: CareerState, rules: RaceRules): SaveResult => {
  const problem = problemOf(career, rules);
  return problem === null
    ? { career, ok: true }
    : { error: problem, ok: false };
};

const currentSave = (
  save: typeof RawSave.Type,
  rules: RaceRules
): SaveResult => {
  const sources = Result.match(decodeSources(save), {
    onFailure: issuePaths,
    onSuccess: () => [],
  });
  return Result.match(decodeSave(save), {
    onFailure: (error) =>
      refused("invalid", firstField([...issuePaths(error), ...sources])),
    onSuccess: (career) =>
      sources.length > 0
        ? refused("invalid", firstField(sources))
        : loaded(career, rules),
  });
};

const decode = (text: string, rules: RaceRules): SaveResult =>
  Result.match(decodeText(text), {
    onFailure: () => refused("notJson", ""),
    onSuccess: (save) =>
      save.version === SAVE_VERSION
        ? currentSave(save, rules)
        : refused("wrongVersion", "version"),
  });

export const serialiseCareer = (career: CareerState): string => {
  const save: typeof EncodedSaveSchema.Type = career;
  return JSON.stringify(save);
};

export const parseCareer = (rules: RaceRules, text: string): SaveResult => {
  try {
    return decode(text, rules);
  } catch {
    return refused("invalid", "");
  }
};
