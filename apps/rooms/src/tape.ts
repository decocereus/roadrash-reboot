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

export const TRACE_ROW_MS = 250;
export const MOST_TRACE_ROWS = 2400;
const MOST_BROWSER_TEXT = 120;

export const TraceField = {
  atMs: 0,
  doubled: 1,
  frames: 2,
  held: 3,
  tick: 4,
  ticksHeard: 5,
  worstFrameMs: 6,
  worstRttMs: 7,
  worstTickGapMs: 8,
} as const;

export const TRACE_ROW_FIELDS = Object.keys(TraceField).length;

const BrowserText = Schema.String.check(Schema.isMaxLength(MOST_BROWSER_TEXT));

export const SeatBrowserSchema = Schema.Struct({
  build: BrowserText,
  gpu: BrowserText,
  graphics: BrowserText,
});

export type SeatBrowser = typeof SeatBrowserSchema.Type;

export const BrowserTraceSchema = Schema.Struct({
  ...SeatBrowserSchema.fields,
  rows: Schema.Array(Schema.Number).check(
    Schema.isMaxLength(MOST_TRACE_ROWS * TRACE_ROW_FIELDS)
  ),
});

export type BrowserTrace = typeof BrowserTraceSchema.Type;

export const MOST_TRACE_CHARS = 512_000;

export const RoomTraceSchema = Schema.Struct({
  rows: Schema.Array(Schema.Number),
});

export type RoomTrace = typeof RoomTraceSchema.Type;

export const ROOM_TRACE_EVERY_TICKS = 15;
export const ROOM_TRACE_FIELDS = 4;

export const roomTraceName = "room-trace.json";
export const riderTraceName = (rider: number): string =>
  `rider-${rider}.trace.json`;
