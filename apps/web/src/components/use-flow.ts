import type { PracticePick } from "@racer/career/field";
import type { RaceRules } from "@racer/career/rules";
import { quitRace, settleRace, startRace } from "@racer/career/settle";
import type { Settlement } from "@racer/career/settle";
import type { CareerState } from "@racer/career/state";
import type { RoadId } from "@racer/career/tables";
import { ROOM_ID_PATTERN, roomKindOf } from "@racer/rooms/room-id";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import { bootGame } from "../asset-load.ts";
import { barCast, barPlates, firstRoad, preload } from "../career/bar.ts";
import { benchOf, benchPlan, rideOf } from "../career/bench.ts";
import { firstQuickPick, quickReport, rideEntry } from "../career/flow.ts";
import type { RaceReport } from "../career/flow.ts";
import {
  browserStorage,
  careerSeedFrom,
  freshCareer,
  loadCareer,
  randomUnit,
  saveStateOf,
  settledRace,
  startOver,
  storedSave,
} from "../career/save.ts";
import type { ReadySave, SaveState } from "../career/save.ts";
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
import {
  firstView,
  graphicsPlaceOf,
  stageOf,
  stepNavigation,
} from "../navigation.ts";
import type { NavigationEvent, View } from "../navigation.ts";
import type { PrepareOutcome } from "../prepare-outcome.ts";
import { loadRaceRules } from "../rules/load.ts";
import type { RulesLoad } from "../rules/load.ts";
import { moveToRoom } from "./room-url.ts";
import { useHandoff } from "./use-handoff.ts";

const modeOf = ({ mode }: RacePlan): "career" | "single" =>
  mode === "career" ? "career" : "single";

const urlRide = (rules: RaceRules): RacePlan | null => {
  const bench = benchOf(globalThis.location.search);
  return bench ? benchPlan(bench) : rideOf(rules, globalThis.location.search);
};

const roomOf = (search: string): string | null => {
  const roomId = new URLSearchParams(search).get("room");
  return roomId !== null && ROOM_ID_PATTERN.test(roomId) ? roomId : null;
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
  readonly careerRef: RefObject<CareerState | null>;
  readonly commit: (career: CareerState) => void;
  readonly settle: (settlement: Settlement) => RaceReport | null;
  readonly eraseSave: () => void;
}

const useSave = (rules: RaceRules | null): Save => {
  const careerRef = useRef<CareerState | null>(null);
  const [save, setSave] = useState<SaveState>({ status: "loading" });

  useEffect(() => {
    if (rules === null) {
      return;
    }
    const loaded = loadCareer(rules, browserStorage);
    careerRef.current = loaded.status === "ready" ? loaded.career : null;
    setSave(saveStateOf(loaded));
  }, [rules]);

  const adopt = useCallback((stored: ReadySave) => {
    careerRef.current = stored.career;
    setSave(stored);
  }, []);

  const commit = useCallback(
    (career: CareerState) => {
      adopt(storedSave(browserStorage, career));
    },
    [adopt]
  );

  const settle = useCallback(
    (settlement: Settlement): RaceReport | null => {
      const settled = settledRace(browserStorage, settlement);
      if (settled === null) {
        return null;
      }
      adopt(settled.save);
      return settled.report;
    },
    [adopt]
  );

  const eraseSave = useCallback(() => {
    const reset = startOver(browserStorage);
    if (reset.status === "reset") {
      careerRef.current = null;
      setSave({ status: "empty" });
    }
  }, []);

  return { careerRef, commit, eraseSave, save, settle };
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
  readonly pick: PracticePick;
  readonly feed: HudFeed;
  readonly ready: boolean;
  readonly failure: string;
  readonly send: (event: NavigationEvent) => void;
  readonly leave: () => void;
  readonly setPick: (pick: PracticePick) => void;
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
  const [feed] = useState(createHudFeed);
  const [races] = useState<RaceEvents>(() =>
    createRaceEvents((event) => {
      diagnostics().events.track(event);
    })
  );
  const [pick, setPick] = useState<PracticePick>(firstQuickPick);
  const rulesLoad = useRules();
  const rules = rulesLoad?.status === "ready" ? rulesLoad.rules : null;
  const { careerRef, commit, eraseSave, save, settle } = useSave(rules);
  const {
    failure: gameFailure,
    gameRef,
    ready,
  } = useGame(canvasRef, eventsRef);
  const { send, state: view } = useHandoff(
    stepNavigation,
    firstView,
    (effect) => {
      switch (effect.kind) {
        case "beginCareer": {
          commit(freshCareer(randomUnit()));
          break;
        }
        case "decodeBar": {
          const decode = async (): Promise<void> => {
            const roadId = firstRoad(effect.rules, effect.career);
            await preload(
              barPlates(barCast(effect.rules, effect.career, roadId))
            );
            send({ kind: "barDecoded" });
          };
          void decode();
          break;
        }
        case "openBar": {
          globalThis.location.assign("/");
          break;
        }
        case "rematch": {
          moveToRoom(effect.roomId, "rematch");
          break;
        }
        default: {
          effect satisfies never;
        }
      }
    }
  );
  const failure =
    rulesLoad?.status === "failed" ? rulesLoad.failure.message : gameFailure;
  const career = save.status === "ready" ? save.career : null;
  useEffect(() => {
    send({
      kind: "entered",
      roomId: roomOf(globalThis.location.search),
      rules: rulesLoad,
      save,
      urlRide:
        rulesLoad?.status === "ready" && urlRide(rulesLoad.rules) !== null,
    });
  }, [rulesLoad, save, send]);
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
      onOver() {
        send({ kind: "raceOver" });
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
        } else if (racer) {
          report = settle(settleRace(racer, outcome));
        }
        send({ kind: "raceSettled", report, result: outcome.result });
      },
      onStart(plan) {
        races.started(raceStartOf(plan, feed.read().riderCount));
        const racer = careerRef.current;
        if (plan.mode !== "career" || !racer) {
          return;
        }
        const started = startRace(racer, plan.setup.roadId, plan.setup.seed);
        if (started.started) {
          commit(started.career);
        } else {
          send({ kind: "raceRefused" });
        }
      },
    };
  }, [careerRef, commit, factsNow, feed, races, send, settle]);

  const start = useCallback(
    (plan: RacePlan) => {
      const game = gameRef.current;
      if (game) {
        game.startRace(plan);
        send({ kind: "raceBegun", plan });
      }
    },
    [gameRef, send]
  );

  useEffect(() => {
    diagnostics().showing(graphicsPlaceOf[view.screen]);
  }, [view.screen]);

  const stage = stageOf(view);
  useEffect(() => {
    const game = gameRef.current;
    if (!(ready && game && rules)) {
      return;
    }
    const plan = stage === "boot" ? urlRide(rules) : null;
    if (plan) {
      start(plan);
    } else if (stage !== "race") {
      game.sleep();
    }
  }, [gameRef, ready, rules, stage, start]);

  const pause = useCallback(() => {
    if (gameRef.current?.pause() === true) {
      send({ kind: "paused" });
    }
  }, [gameRef, send]);
  usePauseKeys(view.screen === "race" && view.stage.kind === "riding", pause);

  const leave = useCallback(() => {
    send({ career: careerRef.current, kind: "left" });
  }, [careerRef, send]);

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
    leave,
    mute: () => gameRef.current?.toggleMute(),
    newCareer() {
      commit(freshCareer(randomUnit()));
      send({ kind: "careerBegun" });
    },
    pick,
    prepare,
    quit(plan) {
      races.ended("quit", factsNow());
      const outcome = gameRef.current?.quit() ?? null;
      send({
        kind: "raceSettled",
        report:
          plan.mode === "career" && career && outcome
            ? settle(quitRace(career, outcome))
            : null,
        result: "quit",
      });
      send({ kind: "raceOver" });
    },
    ready,
    resume() {
      gameRef.current?.resume();
      send({ kind: "resumed" });
    },
    rideOut(mode, roadId) {
      send({
        entry: rideEntry(
          mode,
          roadId,
          career,
          pick,
          careerSeedFrom(randomUnit())
        ),
        kind: "ridePicked",
      });
    },
    roomLost() {
      races.ended("lost", factsNow());
      send({ kind: "signalLost", lostAt: performance.now() });
    },
    rules,
    save,
    send,
    setPick,
    start,
    view,
  };
};
