import { cn } from "@racer/ui/utils";

import { plates } from "../../assets/clubhouse-art.ts";
import { Plate, place, stagePx } from "./clubhouse-stage.tsx";
import type { StageBox } from "./clubhouse-stage.tsx";

const SPEECH = { h: 191, w: 266 } as const;
const SPEECH_TEXT = { h: 88, w: 224, x: 28, y: 24 } as const;
const SPEECH_NAME = { h: 33, w: 147, x: 111, y: 152 } as const;
const BAR_SPEECH = { x: 194, y: 136 } as const;

const LONG_LINE = 60;
const LONGER_LINE = 90;
export interface Speech {
  readonly line: string;
  readonly name: string;
  readonly tag: string | undefined;
  readonly next?: (() => void) | undefined;
}

const speechSize = (line: string): number => {
  if (line.length > LONGER_LINE) {
    return 18;
  }
  return line.length > LONG_LINE ? 21 : 25;
};

const speechText =
  "font-display text-ink flex -rotate-2 items-center justify-center text-center leading-[1.05] font-bold text-balance";

const inside = (
  at: { readonly x: number; readonly y: number },
  part: StageBox,
  flip: boolean
): StageBox => ({
  ...part,
  x: at.x + (flip ? SPEECH.w - part.x - part.w : part.x),
  y: at.y + part.y,
});

export const SpeechSticker = ({
  speech,
  at = BAR_SPEECH,
  flip = false,
}: {
  readonly speech: Speech;
  readonly at?: { readonly x: number; readonly y: number };
  readonly flip?: boolean;
}) => {
  const { line, name, tag, next } = speech;
  const style = {
    ...place(inside(at, SPEECH_TEXT, flip)),
    fontSize: stagePx(speechSize(line)),
  };
  return (
    <figure className="m-0">
      <Plate
        box={{ ...SPEECH, ...at }}
        className={flip ? "-scale-x-100" : undefined}
        src={plates.speech}
      />
      {next === undefined ? (
        <blockquote className={speechText} style={style}>
          {line}
        </blockquote>
      ) : (
        <button
          className={cn(speechText, "focus-visible:outline-ink rounded-sm")}
          onClick={next}
          style={style}
          type="button"
        >
          {line}
        </button>
      )}
      <figcaption
        className="font-display text-ink bg-neon-yellow flex -rotate-3 flex-col px-[0.4em] py-[0.2em] leading-none font-bold tracking-wide uppercase"
        style={{
          ...place(inside(at, SPEECH_NAME, flip)),
          fontSize: stagePx(16),
          height: "auto",
          width: "fit-content",
        }}
      >
        <span>{name}</span>
        {tag !== undefined && (
          <span className="mt-[0.15em] text-[0.75em]">{tag}</span>
        )}
      </figcaption>
    </figure>
  );
};
