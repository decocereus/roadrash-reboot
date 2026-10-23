import type { BoardRow } from "@racer/career/season";
import { cn } from "@racer/ui/utils";
import type { ReactNode } from "react";

import { plates } from "../../assets/clubhouse-art.ts";
import { shortNames } from "../../career/copy.ts";
import { Plate, place, stagePx } from "./clubhouse-stage.tsx";
import type { StageBox } from "./clubhouse-stage.tsx";

const STANDINGS = { h: 366, w: 279, x: 557, y: 100 } as const;
const STANDINGS_TITLE = { h: 50, w: 242, x: 579, y: 132 } as const;
const STANDINGS_ROWS = { h: 212, w: 238, x: 568, y: 195 } as const;
const NOTE_CYAN = { h: 200, w: 278, x: 630, y: 405 } as const;
const NOTE_CYAN_TEXT = { h: 98, w: 134, x: 668, y: 465 } as const;
const NOTE_MAGENTA = { h: 192, w: 325, x: 655, y: 565 } as const;
const NOTE_MAGENTA_TEXT = { h: 125, w: 190, x: 680, y: 604 } as const;
const BILL = { h: 250, w: 124, x: 828, y: 150 } as const;
const STICKER = { h: 190, w: 78, x: 885, y: 405 } as const;
const FLYER = { h: 758, w: 709, x: 963, y: 93 } as const;

const ROWS = 5;
const LONG_NOTE = 30;

const SHEET_SLICE = [297, 50, 445, 80] as const;

export const RuledSheet = ({
  box,
  scale,
}: {
  readonly box: StageBox;
  readonly scale: number;
}) => {
  const widths = SHEET_SLICE.map((edge) => stagePx(edge * scale)).join(" ");
  return (
    <div
      aria-hidden
      style={{
        ...place(box),
        borderImage: `url(${plates.standings}) ${SHEET_SLICE.join(" ")} fill / ${widths} stretch round`,
        borderStyle: "solid",
        borderWidth: widths,
      }}
    />
  );
};

const FIRST_LINE = 206;
const LINE_GAP = 45.2;
const MARGIN = 73;
const RIGHT_EDGE = 50;
const SETTLE = 7;
const TAPE_TOP = 45;
const TAPE_HEIGHT = 78;
const TAPE_TYPE = 50;

export interface RuledLines {
  readonly gap: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
}

export const ruledLines = (box: StageBox, scale: number): RuledLines => {
  const left = box.x + MARGIN * scale + 14;
  return {
    gap: LINE_GAP * scale,
    left,
    top: box.y + FIRST_LINE * scale + SETTLE,
    width: box.x + box.w - RIGHT_EDGE * scale - 20 - left,
  };
};

export const SheetTitle = ({
  box,
  scale,
  children,
}: {
  readonly box: StageBox;
  readonly scale: number;
  readonly children: ReactNode;
}) => (
  <h1
    className="font-display text-ink flex -rotate-6 items-center justify-center leading-none font-black uppercase"
    style={{
      ...place({
        h: TAPE_HEIGHT * scale,
        w: box.w - 90,
        x: box.x + 40,
        y: box.y + TAPE_TOP * scale,
      }),
      fontSize: stagePx(TAPE_TYPE * scale),
    }}
  >
    {children}
  </h1>
);

export const WrittenSheet = ({
  box,
  scale,
  title,
  text,
}: {
  readonly box: StageBox;
  readonly scale: number;
  readonly title: string;
  readonly text: string;
}) => {
  const lines = ruledLines(box, scale);
  return (
    <section aria-label={title}>
      <RuledSheet box={box} scale={scale} />
      <SheetTitle box={box} scale={scale}>
        {title}
      </SheetTitle>
      <p
        className="font-display text-ink/85 -rotate-[0.4deg] font-bold"
        style={{
          ...place({
            h: box.h * 0.6,
            w: lines.width,
            x: lines.left,
            y: lines.top,
          }),
          fontSize: stagePx(lines.gap * 0.72),
          lineHeight: stagePx(lines.gap),
        }}
      >
        {text}
      </p>
    </section>
  );
};

export interface WallNote {
  readonly text: string;
  readonly signature?: string | undefined;
  readonly open?: (() => void) | undefined;
}

export const stampStyle =
  "font-stencil border-[0.12em] px-[0.3em] leading-none whitespace-nowrap uppercase";

const fitted = (text: string, short: number, long: number): string =>
  stagePx(text.length > LONG_NOTE ? long : short);

export const Standings = ({
  rows,
  playerCaption,
}: {
  readonly rows: readonly BoardRow[];
  readonly playerCaption: string;
}) => {
  const top = rows.slice(0, ROWS);
  const mine = rows.find((row) => row.racer === "player");
  const shown =
    mine !== undefined && !top.includes(mine)
      ? [...top.slice(0, ROWS - 1), mine]
      : top;
  return (
    <section aria-label="Season standings">
      <Plate box={STANDINGS} src={plates.standings} />
      <h2
        className="font-display text-ink flex -rotate-6 items-center justify-center leading-none font-black uppercase"
        style={{ ...place(STANDINGS_TITLE), fontSize: stagePx(34) }}
      >
        Season standings
      </h2>
      <ol
        className="font-display text-ink grid -rotate-[0.6deg] grid-rows-5 font-bold uppercase"
        style={{ ...place(STANDINGS_ROWS), fontSize: stagePx(24) }}
      >
        {shown.map((row) => {
          const you = row.racer === "player";
          return (
            <li className="grid grid-rows-2" key={row.racer}>
              <span
                className={cn(
                  "grid grid-cols-[1em_1fr_auto] items-end gap-x-[0.4em] pr-[0.2em] leading-[0.8]",
                  you && "bg-neon-yellow/85"
                )}
              >
                <span className="numeric text-center">{row.rank}</span>
                <span>{you ? "You" : shortNames[row.racer]}</span>
                <span className="numeric">{row.points}</span>
              </span>
              {you && (
                <span className="pl-[2.6em] text-[0.55em] tracking-wide">
                  {playerCaption}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
};

const NoteBody = ({
  note,
  short,
  long,
}: {
  readonly note: WallNote;
  readonly short: number;
  readonly long: number;
}) => (
  <>
    <span style={{ fontSize: fitted(note.text, short, long) }}>
      {note.text}
    </span>
    {note.signature !== undefined && (
      <span className="mt-[0.3em] self-end text-[0.7em]">{note.signature}</span>
    )}
  </>
);

const noteText =
  "font-display flex flex-col justify-center leading-[1.02] font-black uppercase";

const noteSlots = [
  {
    box: NOTE_CYAN,
    ink: "text-neon-cyan -rotate-4 focus-visible:outline-neon-cyan",
    long: 20,
    plate: plates.noteCyan,
    short: 26,
    text: NOTE_CYAN_TEXT,
  },
  {
    box: NOTE_MAGENTA,
    ink: "text-ink -rotate-6 focus-visible:outline-ink",
    long: 20,
    plate: plates.noteMagenta,
    short: 27,
    text: NOTE_MAGENTA_TEXT,
  },
] as const;

export const WallNotes = ({ notes }: { readonly notes: readonly WallNote[] }) =>
  noteSlots.map((slot, index) => {
    const note = notes[index];
    if (note === undefined) {
      return null;
    }
    const body = <NoteBody long={slot.long} note={note} short={slot.short} />;
    return (
      <div key={slot.plate}>
        <Plate box={slot.box} src={slot.plate} />
        {note.open === undefined ? (
          <p className={cn(noteText, slot.ink)} style={place(slot.text)}>
            {body}
          </p>
        ) : (
          <button
            className={cn(noteText, slot.ink, "rounded-sm text-left")}
            onClick={note.open}
            style={place(slot.text)}
            type="button"
          >
            {body}
          </button>
        )}
      </div>
    );
  });

export const WallPosters = ({
  bill,
  sticker,
  flyer,
  roadName,
  stamp,
  onFlyer,
}: {
  readonly bill: string;
  readonly sticker: string;
  readonly flyer: string;
  readonly roadName: string;
  readonly stamp: string | undefined;
  readonly onFlyer: () => void;
}) => (
  <>
    <Plate box={BILL} src={bill} />
    <Plate box={STICKER} src={sticker} />
    <button
      aria-label={`Next race: ${roadName}. Show another road`}
      className="cursor-pointer"
      onClick={onFlyer}
      style={place(FLYER)}
      tabIndex={-1}
      type="button"
    >
      <img
        alt=""
        className="seat-in pointer-events-none size-full object-contain select-none"
        decoding="async"
        draggable={false}
        key={flyer}
        src={flyer}
      />
      {stamp !== undefined && (
        <span
          className={cn(
            stampStyle,
            "text-neon-red border-neon-red bg-ink/75 absolute top-[54%] left-[9%] -rotate-12"
          )}
          style={{ fontSize: stagePx(44) }}
        >
          {stamp}
        </span>
      )}
    </button>
  </>
);
