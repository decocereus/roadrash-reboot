import { cn } from "@racer/ui/utils";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

import { plates } from "../../assets/clubhouse-art.ts";
import { Plate, place, stagePx } from "./clubhouse-stage.tsx";

const BACKDROP = { h: 941, w: 610, x: 0, y: 0 } as const;
const FRONT_SEAT = { h: 577, w: 512, x: 0, y: 278 } as const;
const COUNTER = { h: 148, w: 512, x: 0, y: 620 } as const;
const STOOL = { h: 87, w: 290, x: 280, y: 768 } as const;
const SPEECH = { h: 191, w: 266, x: 194, y: 136 } as const;
const SPEECH_TEXT = { h: 88, w: 224, x: 222, y: 160 } as const;
const SPEECH_NAME = { h: 33, w: 147, x: 305, y: 288 } as const;

const LONG_LINE = 60;
const MS_PER_SECOND = 1000;

let secondsInBar = 0;

export const useBarClock = (): string => {
  const [offset] = useState(() => secondsInBar);
  useEffect(() => {
    const entered = performance.now();
    return () => {
      secondsInBar += (performance.now() - entered) / MS_PER_SECOND;
    };
  }, []);
  return `${-offset}s`;
};

export const BarBackdrop = ({ clock }: { readonly clock: string }) => {
  const timed: CSSProperties = { animationDelay: clock };
  return (
    <div aria-hidden className="absolute inset-0">
      <Plate box={BACKDROP} className="object-cover" src={plates.night} />
      <Plate
        box={BACKDROP}
        className="bar-dusk object-cover"
        src={plates.dusk}
        style={timed}
      />
      <Plate
        box={BACKDROP}
        className="bar-rays object-cover mix-blend-screen"
        src={plates.rays}
        style={{ animationDelay: `${clock}, 0s` }}
      />
    </div>
  );
};

export const BarLight = ({ clock }: { readonly clock: string }) => (
  <div aria-hidden className="pointer-events-none absolute inset-0">
    <div
      className="bar-dusk-wash absolute inset-0"
      style={{ animationDelay: clock }}
    />
    <div
      className="bar-neon absolute inset-0"
      style={{ animationDelay: clock }}
    />
  </div>
);

export const BarSeats = ({ figure }: { readonly figure: string | null }) => (
  <div aria-hidden className="absolute inset-0">
    {figure !== null && (
      <Plate box={FRONT_SEAT} className="seat-in" key={figure} src={figure} />
    )}
    <Plate box={COUNTER} src={plates.counter} />
    <Plate box={STOOL} src={plates.stool} />
  </div>
);

export interface Speech {
  readonly line: string;
  readonly name: string;
  readonly tag: string | undefined;
  readonly next?: (() => void) | undefined;
}

const speechText =
  "font-display text-ink flex -rotate-2 items-center justify-center text-center leading-[1.05] font-bold text-balance";

export const SpeechSticker = ({ speech }: { readonly speech: Speech }) => {
  const { line, name, tag, next } = speech;
  const style = {
    ...place(SPEECH_TEXT),
    fontSize: stagePx(line.length > LONG_LINE ? 21 : 25),
  };
  return (
    <figure className="m-0">
      <Plate box={SPEECH} src={plates.speech} />
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
          ...place(SPEECH_NAME),
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
