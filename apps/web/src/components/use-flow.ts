import type { RaceRules } from "@racer/career/rules";
import { quitRace, settleRace, startRace } from "@racer/career/settle";
import type { TierUp, Settlement } from "@racer/career/settle";
import type { CareerState } from "@racer/career/state";
import type { RoadId } from "@racer/career/tables";
import { ROOM_ID_PATTERN, roomKindOf } from "@racer/rooms/room-id";
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
import { diagnostics, sanitise } from "../diagnostics/hub.ts";
import { createRaceEvents } from "../diagnostics/race-events.ts";
import type { RaceEvents, RaceFacts } from "../diagnostics/race-events.ts";
import type {
  GameEvents,
  GameHandle,
  RaceMode,
  RacePlan,
} from "../game/hud.ts";
import { createHudFeed } from "../hud-feed.ts";
import type { HudFeed } from "../hud-feed.ts";
import type { PrepareOutcome } from "../prepare-outcome.ts";
import { loadRaceRules } from "../rules/load.ts";
import type { RulesLoad } from "../rules/load.ts";

export type View =
  | { readonly screen: "boot" }
  | { readonly screen: "clubhouse"; readonly promotion?: TierUp }
  | { readonly screen: "backRoom" }
  | { readonly screen: "routeBoard" }
  | { readonly screen: "garage" }
  | { readonly screen: "rideOut"; readonly entry: RaceEntry }
  | { readonly screen: "queue" }
  | { readonly screen: "room"; readonly roomId: string }
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
  return report.ledger.tierUp
    ? { promotion: report.ledger.tierUp, screen: "clubhouse" }
    : clubhouse;
};

const stageOf = (view: View): "boot" | "race" | "menu" => {
  if (view.screen === "boot") {
    return "boot";
  }
  return view.screen === "race" ? "race" : "menu";
};

const modeOf = ({ mode }: RacePlan): "career" | "single" =>
  mode === "career" ? "career" : "single";

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

const roomOf = (search: string): string | null => {
  const roomId = new URLSearchParams(search).get("room");
  return roomId !== null && ROOM_ID_PATTERN.test(roomId) ? roomId : null;
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
  const roomId = roomOf(globalThis.location.search);
  if (roomId !== null) {
    return { roomId, screen: "room" };
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
      barPlates(
        barCast(rules.rules, save.career, firstRoad(rules.rules, save.career))
      )
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
        {
          fetch: async (url, signal) => await globalThis.fetch(url, { signal }),
        },
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
            onRestart: () => eventsRef.current?.onRestart(),
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

const MS_PER_SECOND = 1000;
const REASON_LENGTH = 160;

const roomModeOf = (roomId: string) =>
  roomKindOf(roomId) === "public" ? ("public" as const) : ("friends" as const);

const raceStartOf = (plan: RacePlan, riderCount: number) => {
  const room = plan.room?.report();
  const humans = room ? room.names.size + 1 : 1;
  return {
    bots: Math.max(0, riderCount - humans),
    humans,
    mode: room ? roomModeOf(room.roomId) : modeOf(plan),
    raceId: room ? room.raceId : crypto.randomUUID(),
    road: plan.setup.roadId,
  };
};

const useLoadEvents = (
  loaded: boolean,
  failure: string,
  stage: "game" | "rules"
): void => {
  const readyTold = useRef(false);
  useEffect(() => {
    if (loaded && !readyTold.current) {
      readyTold.current = true;
      diagnostics().events.track({
        event: "game_ready",
        loadSeconds: performance.now() / MS_PER_SECOND,
      });
    }
  }, [loaded]);
  useEffect(() => {
    if (failure !== "") {
      diagnostics().events.track({
        event: "game_load_failed",
        reason: sanitise(failure).slice(0, REASON_LENGTH),
        stage,
      });
    }
  }, [failure, stage]);
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
  readonly roomLost: () => void;
}

export const useFlow = (): Flow => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const eventsRef = useRef<GameEvents | null>(null);
  const pendingRef = useRef<RaceReport | null>(null);
  const [feed] = useState(createHudFeed);
  const [races] = useState<RaceEvents>(() =>
    createRaceEvents((event) => {
      diagnostics().events.track(event);
    })
  );
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
  useLoadEvents(
    ready && rules !== null,
    failure,
    rulesLoad?.status === "failed" ? "rules" : "game"
  );

  const factsNow = useCallback((): RaceFacts => {
    const facts = gameRef.current?.riderFacts();
    return {
      crashes: facts?.crashes ?? 0,
      place: feed.read().position,
      roadMetres: facts?.roadMetres ?? 0,
      seconds: facts?.seconds ?? 0,
    };
  }, [feed, gameRef]);

  useEffect(() => {
    const closed = () => {
      races.ended("closed", factsNow());
      diagnostics().events.flush();
    };
    window.addEventListener("pagehide", closed);
    return () => {
      window.removeEventListener("pagehide", closed);
    };
  }, [factsNow, races]);

  useEffect(() => {
    eventsRef.current = {
      onHud: feed.write,
      onOver(plan, outcome) {
        if (outcome.result !== "finished") {
          setView(afterConsequence(plan, pendingRef.current));
          pendingRef.current = null;
        }
      },
      onRestart() {
        races.ended("restarted", factsNow());
      },
      onSettle(plan, outcome) {
        races.ended(outcome.result, { ...factsNow(), place: outcome.place });
        const racer = careerRef.current;
        let report: RaceReport | null = null;
        if (plan.mode === "quick") {
          report = quickReport(plan, outcome);
        } else if (racer && rules) {
          report = settle(settleRace(racer, outcome));
        }
        pendingRef.current = report;
        if (outcome.result === "finished" && report) {
          setView({ finish: report, paused: false, plan, screen: "race" });
        }
      },
      onStart(plan) {
        races.started(raceStartOf(plan, feed.read().riderCount));
        const racer = careerRef.current;
        if (plan.mode !== "career" || !racer || !rules) {
          return;
        }
        const started = startRace(racer, plan.setup.roadId, plan.setup.seed);
        if (started.started) {
          commit(started.career);
        } else {
          setView(clubhouse);
        }
      },
    };
  }, [careerRef, commit, factsNow, feed, races, rules, settle]);

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
      const hub = diagnostics();
      const askedAt = performance.now();
      try {
        const outcome = await game.prepare(plan);
        if (outcome.kind === "failed") {
          hub.events.track({
            event: "game_load_failed",
            reason: outcome.stage,
            stage: "race",
          });
        } else if (outcome.kind !== "cancelled") {
          hub.events.track({
            event: "race_loaded",
            loadSeconds: (performance.now() - askedAt) / MS_PER_SECOND,
            qualityRung: hub.qualityRung(),
          });
        }
        return outcome;
      } catch (error) {
        const cause = error instanceof Error ? error : new Error(String(error));
        hub.recorder.fault("error", cause.message, "prepare build");
        hub.events.track({
          event: "game_load_failed",
          reason: "build",
          stage: "race",
        });
        return { cause, kind: "failed", stage: "build" };
      }
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
    go: setView,
    mute: () => gameRef.current?.toggleMute(),
    newCareer() {
      commit(freshCareer(randomUnit()));
      setView(clubhouse);
    },
    pick,
    prepare,
    quit(plan) {
      races.ended("quit", factsNow());
      const outcome = gameRef.current?.quit() ?? null;
      const report =
        plan.mode === "career" && career && outcome && rules
          ? settle(quitRace(career, outcome))
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
    roomLost() {
      races.ended("lost", factsNow());
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
