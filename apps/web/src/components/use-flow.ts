import type { RaceRules } from "@racer/career/rules";
import { quitRace, settleRace, startRace } from "@racer/career/settle";
import type { LevelUp, Settlement } from "@racer/career/settle";
import type { CareerState } from "@racer/career/state";
import type { RoadId } from "@racer/career/tables";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import { bootGame } from "../asset-load.ts";
import { barCast, barPlates, firstRoad, preload } from "../career/bar.ts";
import { benchOf, benchPlan, rideOf } from "../career/bench.ts";
import {
  careerEntry,
  careerReport,
  firstQuickPick,
  quickEntry,
  quickReport,
} from "../career/flow.ts";
import type { QuickPick, RaceEntry, RaceReport } from "../career/flow.ts";
import {
  browserStorage,
  careerSeedFrom,
  freshCareer,
  loadCareer,
  randomUnit,
  saveStateOf,
  startOver,
  storeCareer,
} from "../career/save.ts";
import type { SaveState } from "../career/save.ts";
import { diagnostics } from "../diagnostics/hub.ts";
import type {
  GameEvents,
  GameHandle,
  RaceMode,
  RacePlan,
} from "../game/hud.ts";
import type { PrepareOutcome } from "../game/preparation.ts";
import { createHudFeed } from "../hud-feed.ts";
import type { HudFeed } from "../hud-feed.ts";
import { loadRaceRules } from "../rules/load.ts";
import type { RulesLoad } from "../rules/load.ts";

export type View =
  | { readonly screen: "boot" }
  | { readonly screen: "clubhouse"; readonly promotion?: LevelUp }
  | { readonly screen: "backRoom" }
  | { readonly screen: "routeBoard" }
  | { readonly screen: "garage" }
  | { readonly screen: "rideOut"; readonly entry: RaceEntry }
  | {
      readonly screen: "race";
      readonly plan: RacePlan;
      readonly paused: boolean;
      readonly finish: RaceReport | null;
    }
  | { readonly screen: "results"; readonly report: RaceReport }
  | { readonly screen: "ending" }
  | { readonly screen: "gameOver" };

export const clubhouse: View = { screen: "clubhouse" };
export const backRoom: View = { screen: "backRoom" };
export const singleRace: View = { screen: "routeBoard" };

export const homeOf = (career: CareerState): View => {
  if (career.gameOver) {
    return { screen: "gameOver" };
  }
  return career.story.ending === null ? clubhouse : { screen: "ending" };
};

export const afterResults = (report: RaceReport): View => {
  if (!report.ledger) {
    return singleRace;
  }
  if (report.ledger.gameOver) {
    return { screen: "gameOver" };
  }
  if (report.ledger.ending !== null) {
    return { screen: "ending" };
  }
  return report.ledger.levelUp
    ? { promotion: report.ledger.levelUp, screen: "clubhouse" }
    : clubhouse;
};

const stageOf = (view: View): "boot" | "race" | "menu" => {
  if (view.screen === "boot") {
    return "boot";
  }
  return view.screen === "race" ? "race" : "menu";
};

const afterConsequence = (plan: RacePlan, report: RaceReport | null): View => {
  if (report) {
    return { report, screen: "results" };
  }
  return plan.mode === "career" ? clubhouse : singleRace;
};

const urlRide = (rules: RaceRules): RacePlan | null => {
  const bench = benchOf(globalThis.location.search);
  return bench ? benchPlan(bench) : rideOf(rules, globalThis.location.search);
};

const entrance = async (
  rules: RulesLoad | null,
  save: SaveState,
  begin: (career: CareerState) => void
): Promise<View | null> => {
  if (rules?.status === "failed") {
    return backRoom;
  }
  if (rules === null || save.status === "loading") {
    return null;
  }
  if (save.status === "corrupt") {
    return backRoom;
  }
  if (save.status === "empty") {
    begin(freshCareer(randomUnit()));
    return null;
  }
  const home = homeOf(save.career);
  if (home.screen === "clubhouse") {
    await preload(
      barPlates(barCast(save.career, firstRoad(rules.rules, save.career)))
    );
  }
  return home;
};

const useBoot = (
  booting: boolean,
  rules: RulesLoad | null,
  save: SaveState,
  begin: (career: CareerState) => void,
  go: (view: View) => void
): void => {
  useEffect(() => {
    const entering = new AbortController();
    const enter = async () => {
      const next = await entrance(rules, save, begin);
      if (next && !entering.signal.aborted) {
        go(next);
      }
    };
    if (
      booting &&
      !(rules?.status === "ready" && urlRide(rules.rules) !== null)
    ) {
      void enter();
    }
    return () => {
      entering.abort();
    };
  }, [booting, rules, save, begin, go]);
};

const useRules = (): RulesLoad | null => {
  const [rules, setRules] = useState<RulesLoad | null>(null);
  useEffect(
    () =>
      loadRaceRules(
        { fetch: async (url) => await globalThis.fetch(url) },
        setRules
      ),
    []
  );
  return rules;
};

interface Save {
  readonly save: SaveState;
  readonly unsaved: boolean;
  readonly careerRef: RefObject<CareerState | null>;
  readonly commit: (career: CareerState) => void;
  readonly settle: (settlement: Settlement) => RaceReport | null;
  readonly eraseSave: () => void;
}

const useSave = (rules: RaceRules | null): Save => {
  const careerRef = useRef<CareerState | null>(null);
  const [save, setSave] = useState<SaveState>({ status: "loading" });
  const [unsaved, setUnsaved] = useState(false);

  useEffect(() => {
    if (rules === null) {
      return;
    }
    const loaded = loadCareer(rules, browserStorage);
    careerRef.current = loaded.status === "ready" ? loaded.career : null;
    setSave(saveStateOf(loaded));
  }, [rules]);

  const commit = useCallback((career: CareerState) => {
    careerRef.current = career;
    setSave({ career, leftRace: null, status: "ready" });
    const stored = storeCareer(browserStorage, career);
    setUnsaved(stored.status !== "saved");
  }, []);

  const settle = useCallback(
    (settlement: Settlement): RaceReport | null => {
      if (!(settlement.settled && settlement.career.lastResult)) {
        return null;
      }
      commit(settlement.career);
      return careerReport(settlement.career.lastResult);
    },
    [commit]
  );

  const eraseSave = useCallback(() => {
    const reset = startOver(browserStorage);
    if (reset.status === "reset") {
      careerRef.current = null;
      setSave({ status: "empty" });
    }
  }, []);

  return { careerRef, commit, eraseSave, save, settle, unsaved };
};

interface Game {
  readonly gameRef: RefObject<GameHandle | null>;
  readonly ready: boolean;
  readonly failure: string;
}

const useGame = (
  canvasRef: RefObject<HTMLCanvasElement | null>,
  eventsRef: RefObject<GameEvents | null>
): Game => {
  const gameRef = useRef<GameHandle | null>(null);
  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState("");

  useEffect(() => {
    const canvas = canvasRef.current;
    const mount = new AbortController();
    const load = async (target: HTMLCanvasElement) => {
      try {
        const game = await bootGame(
          target,
          {
            onHud: (hud) => eventsRef.current?.onHud(hud),
            onOver: (plan, outcome) => eventsRef.current?.onOver(plan, outcome),
            onSettle: (plan, outcome) =>
              eventsRef.current?.onSettle(plan, outcome),
            onStart: (plan) => eventsRef.current?.onStart(plan),
          },
          mount.signal
        );
        if (game === null) {
          return;
        }
        if (mount.signal.aborted) {
          game.dispose();
          return;
        }
        gameRef.current = game;
        setReady(true);
      } catch (error) {
        if (!mount.signal.aborted) {
          setFailure(error instanceof Error ? error.message : String(error));
        }
      }
    };
    if (canvas) {
      diagnostics();
      void load(canvas);
    }
    return () => {
      gameRef.current?.dispose();
      gameRef.current = null;
      mount.abort();
    };
  }, [canvasRef, eventsRef]);

  return { failure, gameRef, ready };
};

const usePauseKeys = (racing: boolean, pause: () => void): void => {
  useEffect(() => {
    const pressed = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.repeat) {
        event.preventDefault();
        pause();
      }
    };
    const hidden = () => {
      if (document.hidden) {
        pause();
      }
    };
    if (racing) {
      window.addEventListener("keydown", pressed);
      document.addEventListener("visibilitychange", hidden);
    }
    return () => {
      window.removeEventListener("keydown", pressed);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [racing, pause]);
};

export interface Flow {
  readonly canvasRef: RefObject<HTMLCanvasElement | null>;
  readonly rules: RaceRules | null;
  readonly view: View;
  readonly save: SaveState;
  readonly career: CareerState | null;
  readonly pick: QuickPick;
  readonly feed: HudFeed;
  readonly ready: boolean;
  readonly failure: string;
  readonly unsaved: boolean;
  readonly go: (view: View) => void;
  readonly setPick: (pick: QuickPick) => void;
  readonly commit: (career: CareerState) => void;
  readonly eraseSave: () => void;
  readonly newCareer: () => void;
  readonly rideOut: (mode: RaceMode, roadId: RoadId) => void;
  readonly prepare: (plan: RacePlan) => Promise<PrepareOutcome>;
  readonly start: (plan: RacePlan) => void;
  readonly resume: () => void;
  readonly mute: () => void;
  readonly quit: (plan: RacePlan) => void;
  readonly followRival: (tag: HTMLDivElement | null) => void;
}

export const useFlow = (): Flow => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const eventsRef = useRef<GameEvents | null>(null);
  const pendingRef = useRef<RaceReport | null>(null);
  const [feed] = useState(createHudFeed);
  const [view, setView] = useState<View>({ screen: "boot" });
  const [pick, setPick] = useState<QuickPick>(firstQuickPick);
  const rulesLoad = useRules();
  const rules = rulesLoad?.status === "ready" ? rulesLoad.rules : null;
  const { careerRef, commit, eraseSave, save, settle, unsaved } =
    useSave(rules);
  const {
    failure: gameFailure,
    gameRef,
    ready,
  } = useGame(canvasRef, eventsRef);
  const failure =
    rulesLoad?.status === "failed" ? rulesLoad.failure.message : gameFailure;
  const career = save.status === "ready" ? save.career : null;
  useBoot(view.screen === "boot", rulesLoad, save, commit, setView);

  useEffect(() => {
    eventsRef.current = {
      onHud: feed.write,
      onOver(plan, outcome) {
        if (outcome.result !== "finished") {
          setView(afterConsequence(plan, pendingRef.current));
          pendingRef.current = null;
        }
      },
      onSettle(plan, outcome) {
        const racer = careerRef.current;
        let report: RaceReport | null = null;
        if (plan.mode === "quick") {
          report = quickReport(plan, outcome);
        } else if (racer && rules) {
          report = settle(settleRace(rules, racer, outcome));
        }
        pendingRef.current = report;
        if (outcome.result === "finished" && report) {
          setView({ finish: report, paused: false, plan, screen: "race" });
        }
      },
      onStart(plan) {
        const racer = careerRef.current;
        if (plan.mode !== "career" || !racer || !rules) {
          return;
        }
        const started = startRace(
          rules,
          racer,
          plan.setup.roadId,
          plan.setup.seed
        );
        if (started.started) {
          commit(started.career);
        } else {
          setView(clubhouse);
        }
      },
    };
  }, [careerRef, commit, feed, rules, settle]);

  const stage = stageOf(view);
  useEffect(() => {
    const game = gameRef.current;
    if (!(ready && game && rules)) {
      return;
    }
    const plan = stage === "boot" ? urlRide(rules) : null;
    if (plan) {
      pendingRef.current = null;
      game.startRace(plan);
      setView({ finish: null, paused: false, plan, screen: "race" });
    } else if (stage !== "race") {
      game.sleep();
    }
  }, [gameRef, ready, rules, stage]);

  const pause = useCallback(() => {
    if (gameRef.current?.pause() === true) {
      setView((current) =>
        current.screen === "race" ? { ...current, paused: true } : current
      );
    }
  }, [gameRef]);
  usePauseKeys(view.screen === "race" && !view.paused && !view.finish, pause);

  const prepare = useCallback(
    async (plan: RacePlan): Promise<PrepareOutcome> => {
      const game = gameRef.current;
      if (!game) {
        return { kind: "cancelled" };
      }
      try {
        return await game.prepare(plan);
      } catch (error) {
        const cause = error instanceof Error ? error : new Error(String(error));
        diagnostics().recorder.fault("error", cause.message, "prepare build");
        return { cause, kind: "failed", stage: "build" };
      }
    },
    [gameRef]
  );

  const followRival = useCallback(
    (tag: HTMLDivElement | null) => {
      gameRef.current?.followRival(tag);
    },
    [gameRef]
  );

  return {
    canvasRef,
    career,
    commit,
    eraseSave,
    failure,
    feed,
    followRival,
    go: setView,
    mute: () => gameRef.current?.toggleMute(),
    newCareer() {
      commit(freshCareer(randomUnit()));
      setView(clubhouse);
    },
    pick,
    prepare,
    quit(plan) {
      const outcome = gameRef.current?.quit() ?? null;
      const report =
        plan.mode === "career" && career && outcome && rules
          ? settle(quitRace(rules, career, outcome))
          : null;
      if (report) {
        setView({ report, screen: "results" });
      } else {
        setView(plan.mode === "career" ? clubhouse : singleRace);
      }
    },
    ready,
    resume() {
      gameRef.current?.resume();
      setView((current) =>
        current.screen === "race" ? { ...current, paused: false } : current
      );
    },
    rideOut(mode, roadId) {
      const entry =
        mode === "career" && career
          ? careerEntry(career, roadId)
          : quickEntry({ ...pick, roadId }, careerSeedFrom(randomUnit()));
      setView({ entry, screen: "rideOut" });
    },
    rules,
    save,
    setPick,
    start(plan) {
      const game = gameRef.current;
      if (!game) {
        return;
      }
      pendingRef.current = null;
      game.startRace(plan);
      setView({ finish: null, paused: false, plan, screen: "race" });
    },
    unsaved,
    view,
  };
};
