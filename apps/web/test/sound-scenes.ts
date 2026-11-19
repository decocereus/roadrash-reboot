import { openDesk } from "../src/sound/desk.ts";
import type { Desk, Level } from "../src/sound/desk.ts";

const SAMPLE_RATE = 48_000;
const READY_POLL_MS = 20;
const READY_LIMIT_MS = 60_000;
const FULL: Level = { muted: false, volume: 1 };
const HEARD = 10 ** (-60 / 20);

export interface Scene {
  readonly name: string;
  readonly left: Float32Array;
  readonly right: Float32Array;
  readonly problems: readonly string[];
}

const pause = async (ms: number): Promise<void> => {
  const { promise, resolve } = Promise.withResolvers<null>();
  setTimeout(() => {
    resolve(null);
  }, ms);
  await promise;
};

const readyFrom = async (desk: Desk, waited: number): Promise<void> => {
  if (desk.stats().waitedMs > 0) {
    return;
  }
  if (waited > READY_LIMIT_MS) {
    throw new Error("The mixer never finished rendering its sounds.");
  }
  await pause(READY_POLL_MS);
  await readyFrom(desk, waited + READY_POLL_MS);
};

const peakOf = (samples: Float32Array, from = 0, to = samples.length) => {
  let peak = 0;
  for (let index = Math.floor(from); index < Math.floor(to); index += 1) {
    peak = Math.max(peak, Math.abs(samples[index] ?? 0));
  }
  return peak;
};

const decibels = (peak: number): string =>
  `${(20 * Math.log10(peak)).toFixed(1)} dBFS`;

interface Staging {
  readonly seconds: number;
  readonly level: Level;
  readonly early?: (desk: Desk) => void;
  readonly ready?: (desk: Desk) => void;
  readonly at?: readonly [number, (desk: Desk) => void];
}

const later = async (
  context: OfflineAudioContext,
  seconds: number,
  work: () => void
): Promise<void> => {
  await context.suspend(seconds);
  work();
  await context.resume();
};

const staged = async ({
  at,
  early,
  level,
  ready,
  seconds,
}: Staging): Promise<readonly [Float32Array, Float32Array]> => {
  const context = new OfflineAudioContext({
    length: Math.ceil(seconds * SAMPLE_RATE),
    numberOfChannels: 2,
    sampleRate: SAMPLE_RATE,
  });
  const faults: string[] = [];
  const desk = openDesk(
    context,
    (message) => {
      faults.push(message);
    },
    level
  );
  early?.(desk);
  await readyFrom(desk, 0);
  ready?.(desk);
  const pending = at
    ? later(context, at[0], () => {
        at[1](desk);
      })
    : Promise.resolve();
  const rendered = await context.startRendering();
  await pending;
  if (faults.length > 0) {
    throw new Error(faults.join("; "));
  }
  return [rendered.getChannelData(0), rendered.getChannelData(1)];
};

const mutedFirstPress = async (): Promise<Scene> => {
  const [left, right] = await staged({
    level: { muted: true, volume: 0.75 },
    ready: (desk) => {
      desk.play("press", 0, 1);
    },
    seconds: 1,
  });
  const peak = Math.max(peakOf(left), peakOf(right));
  return {
    left,
    name: "muted-first-press",
    problems:
      peak === 0 ? [] : [`A muted first press plays at ${decibels(peak)}.`],
    right,
  };
};

const earlyThump = async (): Promise<Scene> => {
  const [fullLeft, fullRight] = await staged({
    level: FULL,
    ready: (desk) => {
      desk.play("thump", 0, 1);
    },
    seconds: 1,
  });
  const [left, right] = await staged({
    early: (desk) => {
      desk.play("thump", 0.8, 0.2);
    },
    level: FULL,
    seconds: 1,
  });
  const rightShare = peakOf(right) / peakOf(fullRight);
  const leftShare = peakOf(left) / peakOf(fullLeft);
  const kept = rightShare < 0.4 && leftShare < rightShare * 0.3;
  return {
    left,
    name: "early-thump-quiet-right",
    problems: kept
      ? []
      : [
          `A thump asked for at gain 0.2, pan 0.8 before it rendered played at ${leftShare.toFixed(2)} left and ${rightShare.toFixed(2)} right of a full centred one.`,
        ],
    right,
  };
};

const HUSH_AT = 0.5;
const HUSH_SETTLED = 2.2;

const hushedRide = async (): Promise<Scene> => {
  const [left, right] = await staged({
    at: [
      HUSH_AT,
      (desk) => {
        desk.hush();
      },
    ],
    level: FULL,
    ready: (desk) => {
      desk.ride(true, 40, 1, 0.8, false);
    },
    seconds: 2.5,
  });
  const riding = peakOf(left, 0, HUSH_AT * SAMPLE_RATE);
  const after = Math.max(
    peakOf(left, HUSH_SETTLED * SAMPLE_RATE),
    peakOf(right, HUSH_SETTLED * SAMPLE_RATE)
  );
  return {
    left,
    name: "ride-then-hush",
    problems: [
      ...(riding > HEARD ? [] : ["The ride was silent before the hush."]),
      ...(after === 0
        ? []
        : [
            `The engine and wind still play at ${decibels(after)} ${(HUSH_SETTLED - HUSH_AT).toFixed(1)} s after the hush.`,
          ]),
    ],
    right,
  };
};

export const scenes = async (): Promise<readonly Scene[]> => [
  await mutedFirstPress(),
  await earlyThump(),
  await hushedRide(),
];
