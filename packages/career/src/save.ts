import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

import { problemOf } from "./save-invariants.ts";
import { firstField, issuePaths } from "./save-issues.ts";
import { EncodedSaveSchema, SaveSourceSchema } from "./save-schema.ts";
import type { SaveError } from "./save-schema.ts";
import {
  blankMemory,
  blankSeason,
  byRacer,
  byRival,
  endingIds,
  SAVE_VERSION,
} from "./state.ts";
import type { CareerState } from "./state.ts";

export type SaveResult =
  | { readonly ok: true; readonly career: CareerState }
  | { readonly ok: false; readonly error: SaveError };

const RawSave = Schema.Record(Schema.String, Schema.Unknown);

const version7Endings = [...endingIds, "bought-crown"] as const;
const Version7Ending = Schema.NullOr(Schema.Literals(version7Endings));
const withRest = <Fields extends Schema.Struct.Fields>(fields: Fields) =>
  Schema.StructWithRest(Schema.Struct(fields), [RawSave]);

const Version7Save = withRest({
  lastResult: Schema.NullOr(
    withRest({ ledger: withRest({ ending: Version7Ending }) })
  ),
  story: withRest({ ending: Version7Ending }),
  version: Schema.Literal(7),
});

const decodeText = Schema.decodeUnknownResult(Schema.fromJsonString(RawSave));
const decodeSave = Schema.decodeUnknownResult(EncodedSaveSchema, {
  errors: "all",
});
const decodeVersion7 = Schema.decodeUnknownResult(Version7Save, {
  errors: "all",
});
const decodeSources = Schema.decodeUnknownResult(SaveSourceSchema, {
  errors: "all",
});

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

const withEveryRacer = (save: typeof EncodedSaveSchema.Type): CareerState => ({
  ...save,
  memory: byRival((rival) => save.memory[rival] ?? blankMemory),
  season: byRacer((racer) => save.season[racer] ?? blankSeason),
});

const currentSave = (save: typeof RawSave.Type): SaveResult => {
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
        : loaded(withEveryRacer(career)),
  });
};

const crownOf = (
  ending: typeof Version7Ending.Type
): (typeof endingIds)[number] | null =>
  ending === "bought-crown" ? "clean-crown" : ending;

const fromVersion7 = (save: typeof RawSave.Type): SaveResult =>
  Result.match(decodeVersion7(save), {
    onFailure: (error) => refused("invalid", firstField(issuePaths(error))),
    onSuccess: ({ lastResult, story, ...rest }) =>
      currentSave({
        ...rest,
        lastResult: lastResult && {
          ...lastResult,
          ledger: {
            ...lastResult.ledger,
            ending: crownOf(lastResult.ledger.ending),
          },
        },
        story: { ...story, ending: crownOf(story.ending) },
        version: SAVE_VERSION,
      }),
  });

const VERSION_7 = 7;

const decode = (text: string): SaveResult =>
  Result.match(decodeText(text), {
    onFailure: () => refused("notJson", ""),
    onSuccess: (save) => {
      if (save.version === SAVE_VERSION) {
        return currentSave(save);
      }
      return save.version === VERSION_7
        ? fromVersion7(save)
        : refused("wrongVersion", "version");
    },
  });

export const serialiseCareer = (career: CareerState): string => {
  const save: typeof EncodedSaveSchema.Type = career;
  return JSON.stringify(save);
};

export const parseCareer = (text: string): SaveResult => {
  try {
    return decode(text);
  } catch {
    return refused("invalid", "");
  }
};
