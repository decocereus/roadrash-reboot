import type { RivalId } from "@racer/sim/cast";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

import { figures, plates } from "../../assets/clubhouse-art.ts";
import { shortNames } from "../../career/copy.ts";
import { Plate, place, stagePx } from "./clubhouse-stage.tsx";

const BACKDROP = { h: 941, w: 610, x: 0, y: 0 } as const;
const FRONT_SEAT = { h: 577, w: 512, x: 0, y: 278 } as const;
const COUNTER = { h: 235, w: 512, x: 0, y: 620 } as const;
const BACK_SEAT = { h: 203, w: 180, x: 425, y: 400 } as const;
const BACK_TAG = { h: 44, w: 128, x: 420, y: 352 } as const;
const SPEECH = { h: 191, w: 266, x: 194, y: 136 } as const;
const SPEECH_TEXT = { h: 120, w: 234, x: 207, y: 152 } as const;
const SPEECH_NAME = { h: 33, w: 147, x: 305, y: 288 } as const;

const BACK_SEAT_MS = 20_000;
const LEAVE_MS = 700;
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

const useRotation = (riders: readonly RivalId[]) => {
  const [turn, setTurn] = useState(0);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    let swap: ReturnType<typeof setTimeout> | undefined;
    const tick =
      riders.length < 2
        ? undefined
        : setInterval(() => {
            setLeaving(true);
            swap = setTimeout(() => {
              setTurn((current) => current + 1);
              setLeaving(false);
            }, LEAVE_MS);
          }, BACK_SEAT_MS);
    return () => {
      clearInterval(tick);
      clearTimeout(swap);
    };
  }, [riders]);
  return { leaving, rider: riders[turn % Math.max(1, riders.length)] };
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

export const BarSeats = ({
  speaker,
  regulars,
  boss,
  roadName,
}: {
  readonly speaker: RivalId | null;
  readonly regulars: readonly RivalId[];
  readonly boss: RivalId;
  readonly roadName: string;
}) => {
  const { rider, leaving } = useRotation(regulars);
  return (
    <div aria-hidden className="absolute inset-0">
      {rider !== undefined && (
        <div
          className={`absolute inset-0 ${leaving ? "seat-out" : "seat-in"}`}
          key={rider}
        >
          <Plate
            box={BACK_SEAT}
            className="[mask-image:linear-gradient(to_bottom,black_72%,transparent)] brightness-[0.62] saturate-[0.85]"
            src={figures[rider]}
          />
          <p
            className="bg-neon-yellow text-ink font-display flex -rotate-2 flex-col px-[0.4em] py-[0.15em] leading-none font-bold tracking-wide uppercase"
            style={{
              ...place(BACK_TAG),
              fontSize: stagePx(18),
              height: "auto",
              width: "fit-content",
            }}
          >
            <span>{shortNames[rider]}</span>
            {rider === boss && (
              <span className="text-[0.62em]">Boss of {roadName}</span>
            )}
          </p>
        </div>
      )}
      {speaker !== null && (
        <Plate box={FRONT_SEAT} className="seat-in" src={figures[speaker]} />
      )}
      <Plate box={COUNTER} src={plates.counter} />
    </div>
  );
};

export const SpeechSticker = ({
  line,
  name,
  tag,
}: {
  readonly line: string;
  readonly name: string;
  readonly tag: string | undefined;
}) => (
  <figure className="m-0">
    <Plate box={SPEECH} src={plates.speech} />
    <blockquote
      className="font-display text-ink flex -rotate-3 items-center leading-[1.05] font-bold"
      style={{ ...place(SPEECH_TEXT), fontSize: stagePx(25) }}
    >
      {line}
    </blockquote>
    <figcaption
      className="font-display text-ink/80 flex -rotate-3 flex-col items-end leading-none font-bold tracking-wide uppercase"
      style={{ ...place(SPEECH_NAME), fontSize: stagePx(15) }}
    >
      <span>{name}</span>
      {tag !== undefined && <span className="text-red mt-[0.15em]">{tag}</span>}
    </figcaption>
  </figure>
);
