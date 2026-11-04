import * as Schema from "effect/Schema";

export const TAPE_VERSION = 1;
export const TAPE_KEEP_DAYS = 7;

export const TapeHeaderSchema = Schema.Struct({
  build: Schema.String,
  digest: Schema.String,
  raceId: Schema.String,
  road: Schema.String,
  seats: Schema.Number,
  seed: Schema.Number,
  version: Schema.Literal(TAPE_VERSION),
});

export type TapeHeader = typeof TapeHeaderSchema.Type;

export const TapeEndSchema = Schema.Struct({
  parts: Schema.Number,
  tick: Schema.Number,
});

export type TapeEnd = typeof TapeEndSchema.Type;

const PART_DIGITS = 5;

export const tapeHeaderName = "header.json";
export const tapeEndName = "end.json";
export const tapePartName = (part: number): string =>
  `${String(part).padStart(PART_DIGITS, "0")}.bin`;
export const tapeKey = (raceId: string, name: string): string =>
  `tapes/${raceId}/${name}`;
