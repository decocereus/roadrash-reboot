import { recordedRules } from "@racer/career/bench";
import type { RaceOutcome } from "@racer/career/outcome";

import { celebrityLoader } from "../src/asset-load.ts";
import { browserAssetRuntime } from "../src/asset-runtime.ts";
import { firstQuickPick, planFor, quickEntry } from "../src/career/flow.ts";
import type { QuickPick } from "../src/career/flow.ts";
import type { AcquiredAssets } from "../src/game/assets.ts";
import { assetParsers, createGame } from "../src/game/game.ts";
import type { GameHandle, HudState, RacePlan } from "../src/game/hud.ts";

const SEED = 31;
const WIDTH = 960;
const HEIGHT = 540;
const LOOK_MS = 500;
const WAIT_MS = 400_000;
const POLL_MS = 16;
const ROAD_A: QuickPick["roadId"] = "ridge-road";
const ROAD_B: QuickPick["roadId"] = "slag-row";
const ROAD_C: QuickPick["roadId"] = "breakwater-run";

interface DevHold {
  readonly held: () => boolean;
  readonly release: () => void;
}

interface Scene {
  readonly game: GameHandle;
  readonly hold: DevHold;
  readonly hud: () => HudState;
  readonly say: (line: string) => void;
}

const planOn = (roadId: QuickPick["roadId"]): RacePlan =>
  planFor(recordedRules, null, quickEntry({ ...firstQuickPick, roadId }, SEED));

const proofCanvas = (): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = `position:fixed;left:0;top:0;width:${WIDTH}px;height:${HEIGHT}px;z-index:10`;
  const last = document.body.lastChild;
  if (!last) {
    throw new Error("The page has nothing to place the proof canvas after.");
  }
  last.after(canvas);
  return canvas;
};

const acquire = async (): Promise<AcquiredAssets> => {
  const { promise, reject, resolve } = Promise.withResolvers<AcquiredAssets>();
  const runtime = browserAssetRuntime();
  runtime.mount({
    failed: reject,
    fontFallback: (error) => {
      throw error;
    },
    interrupted: () => {
      reject(new Error("The asset load was interrupted."));
    },
    loaded: (assets, release) => {
      resolve({
        assets,
        loadCelebrity: celebrityLoader(
          runtime.mountCelebrity,
          Promise.resolve({ assetParsers })
        ),
        release,
      });
    },
    parsers: assetParsers,
    signal: new AbortController().signal,
  });
  return await promise;
};

const sleepMs = async (ms: number): Promise<null> => {
  const { promise, resolve } = Promise.withResolvers<null>();
  setTimeout(() => {
    resolve(null);
  }, ms);
  return await promise;
};

const until = async (
  label: string,
  done: () => boolean,
  startedAt = performance.now()
): Promise<void> => {
  if (done()) {
    return;
  }
  if (performance.now() - startedAt > WAIT_MS) {
    throw new Error(`Gave up waiting for ${label}.`);
  }
  await sleepMs(POLL_MS);
  await until(label, done, startedAt);
};

const outcomeLine = (outcome: RaceOutcome | null): string =>
  outcome === null
    ? "null"
    : `${outcome.roadId} ${outcome.result} place=${outcome.place}`;

const anyPlace = (line: string): string =>
  line.replace(/place=\d+/u, "place=n");

const raceClockStill = async ({ game, say }: Scene, label: string) => {
  const before = game.riderFacts().seconds;
  await sleepMs(LOOK_MS);
  say(`${label} still=${game.riderFacts().seconds === before}`);
};

const settledRaceRidesOn = async ({ game, say }: Scene) => {
  const before = game.riderFacts().seconds;
  await sleepMs(LOOK_MS);
  say(`settled race rides on=${game.riderFacts().seconds > before}`);
};

const whenGreen = async ({ hud }: Scene) => {
  await until("the green light", () => hud().phase === "racing");
  await until("the countdown to clear", () => hud().countdown === 0);
};

const attract = async ({ game, hud, say }: Scene): Promise<void> => {
  const first = hud().roadName;
  say(`attract road=${first} pause=${game.pause()}`);
  await until("the next attract road", () => hud().roadName !== first);
  say(`attract road=${hud().roadName} phase=${hud().phase}`);
  game.sleep();
  say(`slept phase=${hud().phase}`);
};

const pausing = async (scene: Scene): Promise<void> => {
  const { game, hud, say } = scene;
  say(`attract pause=${game.pause()}`);
  say(`attract quit=${outcomeLine(game.quit())} phase=${hud().phase}`);
  const planA = planOn(ROAD_A);
  const prepared = await game.prepare(planA);
  const same = await game.prepare(planA);
  say(`prepared ${prepared.kind} same=${same.kind}`);
  say(`idle pause=${game.pause()} phase=${hud().phase}`);
  game.startRace(planA);
  say(`counting pause=${game.pause()}`);
  await whenGreen(scene);
  say(`green pause=${game.pause()} again=${game.pause()}`);
  await raceClockStill(scene, "paused");
  game.toggleMute();
  say(`paused mute phase=${hud().phase} countdown=${hud().countdown}`);
  game.toggleMute();
  game.resume();
  game.resume();
  await until("the resume hold to publish", () => hud().countdown > 0);
  say(`resuming countdown=${hud().countdown}`);
  await raceClockStill(scene, "resuming");
  say(`paused in the hold=${game.pause()}`);
  await raceClockStill(scene, "paused in the hold");
  game.toggleMute();
  say(`paused in the hold keeps=${hud().countdown > 0}`);
  game.toggleMute();
  game.resume();
  await until("the hold to end", () => hud().countdown === 0);
  await until("the clock to move", () => game.riderFacts().seconds > 0);
  say("rode on after the hold");
  game.startRace(planA);
  say(`restarted seconds=${game.riderFacts().seconds}`);
  await until("its countdown", () => hud().phase === "countdown");
  await whenGreen(scene);
  say(`green again pause=${game.pause()}`);
  game.resume();
  await until("the second hold to publish", () => hud().countdown > 0);
  say(`paused in the second hold=${game.pause()}`);
  say(`quit=${anyPlace(outcomeLine(game.quit()))}`);
  say(`after quit phase=${hud().phase} again=${outcomeLine(game.quit())}`);
  const planB = planOn(ROAD_B);
  await game.prepare(planB);
  game.startRace(planB);
  await until("the next countdown", () => hud().countdown === 3);
  say(`counting quit=${anyPlace(outcomeLine(game.quit()))}`);
  say(`after quit phase=${hud().phase}`);
  game.sleep();
};

const finishing = async (scene: Scene): Promise<void> => {
  const { game, hud, say } = scene;
  const planB = planOn(ROAD_B);
  await game.prepare(planB);
  say(`countdown on ${hud().roadName}`);
  game.startRace(planB);
  await until("the race to settle", () => hud().phase === "settled");
  say(`settled pause=${game.pause()} position=${hud().position}`);
  await settledRaceRidesOn(scene);
  const planC = planOn(ROAD_C);
  const preparing = game.prepare(planC);
  game.startRace(planC);
  const prepared = await preparing;
  say(`started while dressing ${prepared.kind}`);
  await until("its countdown", () => hud().phase === "countdown");
  say(`counting on ${hud().roadName}`);
  await whenGreen(scene);
  game.sleep();
  say(`slept phase=${hud().phase}`);
};

const crashing = async ({ game, hud, say }: Scene): Promise<void> => {
  const planB = planOn(ROAD_B);
  await game.prepare(planB);
  game.startRace(planB);
  await until("the race to settle", () => hud().phase === "settled");
  say(`settled position=${hud().position}`);
  await sleepMs(LOOK_MS * 4);
  say(`after the delay quit=${outcomeLine(game.quit())}`);
};

const holding = async (scene: Scene): Promise<void> => {
  const { game, hold, hud, say } = scene;
  const planB = planOn(ROAD_B);
  await game.prepare(planB);
  game.startRace(planB);
  await until("the dev hold", hold.held);
  say(`held phase=${hud().phase} pause=${game.pause()}`);
  await raceClockStill(scene, "held");
  const heldAt = game.riderFacts().seconds;
  hold.release();
  await until("the clock to move", () => game.riderFacts().seconds > heldAt);
  say(`released hud countdown=${hud().countdown}`);
  await sleepMs(LOOK_MS * 4);
  say(`after release phase=${hud().phase}`);
  game.sleep();
};

const quittingWhilePreparing = async ({
  game,
  hud,
  say,
}: Scene): Promise<void> => {
  const planB = planOn(ROAD_B);
  const preparing = game.prepare(planB);
  game.startRace(planB);
  say(`quit while preparing=${outcomeLine(game.quit())} phase=${hud().phase}`);
  const prepared = await preparing;
  say(`prepared ${prepared.kind}`);
  await until("the waiting start", () => hud().phase === "countdown");
  say(`counting on ${hud().roadName}`);
};

const scenarios = {
  attract,
  crashing,
  finishing,
  holding,
  pausing,
  quittingWhilePreparing,
} as const satisfies Record<string, (scene: Scene) => Promise<void>>;

export const run = async (
  name: keyof typeof scenarios,
  hold: DevHold
): Promise<readonly string[]> => {
  const lines: string[] = [];
  const say = (line: string) => {
    lines.push(line);
  };
  let latest: HudState | null = null;
  const hud = (): HudState => {
    if (!latest) {
      throw new Error("The game has published no HUD yet.");
    }
    return latest;
  };
  const canvas = proofCanvas();
  const game = createGame(
    canvas,
    {
      onHud: (next) => {
        const before = latest;
        latest = next;
        if (
          before?.phase !== next.phase ||
          before.countdown !== next.countdown
        ) {
          say(`hud ${next.phase} ${next.countdown}`);
        }
      },
      onOver: (plan, outcome) => {
        say(
          `onOver ${plan.mode} ${outcomeLine(outcome)} tick=${outcome.tick} seconds=${game.riderFacts().seconds.toFixed(3)}`
        );
      },
      onRestart: () => {
        say("onRestart");
      },
      onSettle: (plan, outcome) => {
        say(
          `onSettle ${plan.mode} ${outcomeLine(outcome)} tick=${outcome.tick} seconds=${game.riderFacts().seconds.toFixed(3)}`
        );
      },
      onStart: (plan) => {
        say(`onStart ${plan.setup.roadId}`);
      },
    },
    await acquire()
  );
  try {
    await until("the first attract publish", () => latest !== null);
    await scenarios[name]({ game, hold, hud, say });
  } catch (error) {
    say(`failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  game.dispose();
  canvas.remove();
  return lines;
};
