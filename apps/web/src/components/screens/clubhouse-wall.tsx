import type { BoardRow } from "@racer/career/season";
import { cn } from "@racer/ui/utils";

import { plates } from "../../assets/clubhouse-art.ts";
import { shortNames } from "../../career/copy.ts";
import { Plate, place, stagePx } from "./clubhouse-stage.tsx";

const STANDINGS = { h: 366, w: 279, x: 557, y: 100 } as const;
const STANDINGS_TITLE = { h: 71, w: 223, x: 582, y: 120 } as const;
const STANDINGS_ROWS = { h: 275, w: 225, x: 584, y: 178 } as const;
const NOTE_CYAN = { h: 200, w: 278, x: 630, y: 405 } as const;
const NOTE_CYAN_TEXT = { h: 114, w: 158, x: 653, y: 457 } as const;
const NOTE_MAGENTA = { h: 192, w: 325, x: 655, y: 565 } as const;
const NOTE_MAGENTA_TEXT = { h: 125, w: 190, x: 680, y: 604 } as const;
const BILL = { h: 250, w: 124, x: 828, y: 150 } as const;
const STICKER = { h: 190, w: 78, x: 885, y: 405 } as const;
const FLYER = { h: 758, w: 709, x: 963, y: 93 } as const;

const ROWS = 5;
const LONG_NOTE = 30;

export interface WallNote {
  readonly text: string;
  readonly signature?: string | undefined;
  readonly open?: (() => void) | undefined;
}

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
        className="font-display text-ink flex -rotate-3 items-center justify-center leading-none font-black uppercase"
        style={{ ...place(STANDINGS_TITLE), fontSize: stagePx(34) }}
      >
        Season standings
      </h2>
      <ol
        className="font-display text-ink grid -rotate-1 grid-rows-5 font-bold uppercase"
        style={{ ...place(STANDINGS_ROWS), fontSize: stagePx(28) }}
      >
        {shown.map((row) => {
          const you = row.racer === "player";
          return (
            <li
              className={cn(
                "grid grid-cols-[1.2em_1fr_auto] items-center leading-none",
                you && "bg-neon-yellow/85 -mx-[0.15em] my-[0.12em] px-[0.15em]"
              )}
              key={row.racer}
            >
              <span className="numeric">{row.rank}</span>
              <span className="flex flex-col">
                <span>{you ? "You" : shortNames[row.racer]}</span>
                {you && (
                  <span className="text-[0.55em] tracking-wide">
                    {playerCaption}
                  </span>
                )}
              </span>
              <span className="numeric">{row.points}</span>
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
    long: 22,
    plate: plates.noteCyan,
    short: 31,
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
}: {
  readonly bill: string;
  readonly sticker: string;
  readonly flyer: string;
  readonly roadName: string;
}) => (
  <>
    <Plate box={BILL} src={bill} />
    <Plate box={STICKER} src={sticker} />
    <img
      alt={`Next race: ${roadName}`}
      className="pointer-events-none object-contain select-none"
      decoding="async"
      draggable={false}
      src={flyer}
      style={place(FLYER)}
    />
  </>
);
