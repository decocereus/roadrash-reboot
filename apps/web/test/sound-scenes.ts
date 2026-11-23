import { PLAYER_RIDER, riderOf } from "@racer/sim/state";
import type { BikeClass } from "@racer/sim/state";

import { openDesk } from "../src/sound/desk.ts";
import type { Desk, Level } from "../src/sound/desk.ts";
import type { Ride } from "../src/sound/race-mix.ts";
import { passingField, placeAhead } from "./passing-field.ts";

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
  readonly timeline?: readonly (readonly [number, (desk: Desk) => void])[];
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
  early,
  level,
  ready,
  seconds,
  timeline = [],
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
  const pending = Promise.all(
    timeline.map(async ([at, work]) => {
      await later(context, at, () => {
        work(desk);
      });
    })
  );
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
const TOP_SPEED = 61.3;

const flatOut: Ride = {
  brake: 1,
  lean: 1,
  offRoad: false,
  on: true,
  revs: 1,
  speed: TOP_SPEED,
  throttle: 1,
};

const hushedRide = async (bikeClass: BikeClass): Promise<Scene> => {
  const [left, right] = await staged({
    level: FULL,
    ready: (desk) => {
      desk.prepare(bikeClass);
      desk.ride({ ...flatOut, brake: 0, lean: 0, revs: 0.8, speed: 40 });
    },
    seconds: 2.5,
    timeline: [
      [
        HUSH_AT,
        (desk) => {
          desk.hush();
        },
      ],
    ],
  });
  const riding = peakOf(left, 0, HUSH_AT * SAMPLE_RATE);
  const after = Math.max(
    peakOf(left, HUSH_SETTLED * SAMPLE_RATE),
    peakOf(right, HUSH_SETTLED * SAMPLE_RATE)
  );
  return {
    left,
    name: `${bikeClass}-hush`,
    problems: [
      ...(riding > HEARD
        ? []
        : [`The ${bikeClass} was silent before the hush.`]),
      ...(after === 0
        ? []
        : [
            `The ${bikeClass} engine and wind still play at ${decibels(after)} ${(HUSH_SETTLED - HUSH_AT).toFixed(1)} s after the hush.`,
          ]),
    ],
    right,
  };
};

const PILE_UP_AT = 0.3;
const CRASHES = 8;
const CRASH_GAIN = 0.7;
const PASSING_GAPS = [1.5, 3, 4.5, 6] as const;

const packAround = () => {
  const race = passingField();
  for (const [at, gap] of PASSING_GAPS.entries()) {
    const rider = riderOf(race.riders, placeAhead(race, at + 1, gap));
    if (rider) {
      rider.revs = 1;
      rider.speed = TOP_SPEED;
    }
  }
  const me = riderOf(race.riders, PLAYER_RIDER);
  if (me) {
    me.speed = TOP_SPEED;
  }
  return race;
};

const pileUp = async (): Promise<Scene> => {
  const race = packAround();
  const [left, right] = await staged({
    level: FULL,
    ready: (desk) => {
      desk.prepare("featherweight");
      desk.ride(flatOut);
      desk.hear(race, PLAYER_RIDER);
    },
    seconds: 3,
    timeline: [
      [
        PILE_UP_AT,
        (desk) => {
          for (let crash = 0; crash < CRASHES; crash += 1) {
            desk.play("crash", 0, CRASH_GAIN);
          }
        },
      ],
    ],
  });
  const peak = Math.max(peakOf(left), peakOf(right));
  return {
    left,
    name: "pile-up-ceiling",
    problems:
      peak < 1
        ? []
        : [
            `Eight crashes over a flat-out engine and four close riders reach ${decibels(peak)}.`,
          ],
    right,
  };
};

const COUNT_LEAD = 0.16;
const COUNTDOWN_HITS = [
  [COUNT_LEAD, "count"],
  [COUNT_LEAD + 1, "count"],
  [COUNT_LEAD + 2, "count"],
  [COUNT_LEAD + 3, "go"],
] as const;
const DEFAULT_LEVEL: Level = { muted: false, volume: 0.75 };
const HIT_WINDOW = 0.25;
const HIT_OVER_TAIL = 4;

const countdown = async (): Promise<Scene> => {
  const [left, right] = await staged({
    level: DEFAULT_LEVEL,
    seconds: 5,
    timeline: COUNTDOWN_HITS.map(
      ([at, cue]) =>
        [
          at,
          (desk: Desk) => {
            desk.play(cue, 0, 1);
          },
        ] as const
    ),
  });
  const peak = Math.max(peakOf(left), peakOf(right));
  const missed = COUNTDOWN_HITS.filter(([at]) => {
    const hit = peakOf(left, at * SAMPLE_RATE, (at + HIT_WINDOW) * SAMPLE_RATE);
    const before = peakOf(
      left,
      (at - HIT_WINDOW) * SAMPLE_RATE,
      at * SAMPLE_RATE
    );
    return hit < HEARD || hit < before * HIT_OVER_TAIL;
  });
  return {
    left,
    name: "countdown",
    problems: [
      ...missed.map(
        ([at, cue]) =>
          `The ${cue} due at ${at.toFixed(2)} s does not stand out from what came before it.`
      ),
      ...(peak < 1 ? [] : [`The countdown reaches ${decibels(peak)}.`]),
    ],
    right,
  };
};

export const scenes = async (): Promise<readonly Scene[]> => [
  await mutedFirstPress(),
  await earlyThump(),
  await hushedRide("featherweight"),
  await hushedRide("middleweight"),
  await hushedRide("heavyweight"),
  await pileUp(),
  await countdown(),
];
