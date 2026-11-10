import type { RaceRules } from "@racer/career/rules";
import type { CareerState } from "@racer/career/state";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";

import { planFor } from "../career/flow.ts";
import type { RaceEntry } from "../career/flow.ts";
import { diagnostics } from "../diagnostics/hub.ts";
import type { RacePlan } from "../game/hud.ts";
import { raceAgainOffered, stageOf } from "../navigation.ts";
import { preparedRace } from "../prepare-outcome.ts";
import type { PrepareOutcome } from "../prepare-outcome.ts";
import { stepRideOut } from "../race-handoff.ts";
import type { RideOutHandoff } from "../race-handoff.ts";
import { BarHome } from "./bar-home.tsx";
import { BootScreen, ElsewhereScreen } from "./screens/boot.tsx";
import { DataNotice } from "./screens/data-notice.tsx";
import { FinishBanner } from "./screens/finish.tsx";
import { EndingScreen, GameOverScreen } from "./screens/game-over.tsx";
import { PauseScreen } from "./screens/pause.tsx";
import { RaceHud } from "./screens/race-hud.tsx";
import { ResultsScreen } from "./screens/results.tsx";
import { RideOutScreen } from "./screens/ride-out.tsx";
import { useFlow } from "./use-flow.ts";
import type { Flow } from "./use-flow.ts";
import { useHandoff } from "./use-handoff.ts";

const drawsNothing = () => null;

const RoomRaceScreens = import.meta.env.SSR
  ? drawsNothing
  : lazy(async () => {
      const { RoomRaceScreens: screens } =
        await import("./room-race-screens.tsx");
      return { default: screens };
    });

const DWELL_MS = 2200;

const RideOut = ({
  rules,
  career,
  entry,
  ready,
  failure,
  onPrepare,
  onStart,
  onBack,
}: {
  readonly rules: RaceRules;
  readonly career: CareerState | null;
  readonly entry: RaceEntry;
  readonly ready: boolean;
  readonly failure: string;
  readonly onPrepare: (plan: RacePlan) => Promise<PrepareOutcome>;
  readonly onStart: (plan: RacePlan) => void;
  readonly onBack: () => void;
}) => {
  const { send, state: handoff } = useHandoff(
    stepRideOut<RacePlan>,
    (): RideOutHandoff<RacePlan> => ({
      kind: "waitingForGame",
      ride: planFor(rules, career, entry),
    }),
    (effect) => {
      switch (effect.kind) {
        case "prepare": {
          const prepare = async (): Promise<void> => {
            send({ kind: preparedRace(await onPrepare(effect.ride)) });
          };
          void prepare();
          break;
        }
        case "start": {
          onStart(effect.ride);
          break;
        }
        default: {
          effect.kind satisfies never;
        }
      }
    }
  );
  useEffect(() => {
    const dwell = setTimeout(() => {
      send({ kind: "dwellElapsed" });
    }, DWELL_MS);
    return () => {
      clearTimeout(dwell);
    };
  }, [send]);
  useEffect(() => {
    if (ready) {
      send({ kind: "gameReady" });
    }
  }, [ready, send]);
  return (
    <RideOutScreen
      career={career}
      failure={failure}
      loadFailed={handoff.kind === "failed" || handoff.kind === "failedDwelt"}
      onBack={() => {
        send({ kind: "closed" });
        onBack();
      }}
      onRetry={() => {
        send({ kind: "retry" });
      }}
      plan={handoff.ride}
      ready={handoff.kind === "dwelling" || handoff.kind === "started"}
    />
  );
};

const MenuScreens = ({ flow }: { readonly flow: Flow }) => {
  const { view, career, rules } = flow;
  switch (view.screen) {
    case "boot": {
      return <BootScreen />;
    }
    case "elsewhere": {
      return <ElsewhereScreen />;
    }
    case "bar":
    case "race": {
      return null;
    }
    case "ending": {
      return career ? (
        <EndingScreen career={career} onBackRoom={flow.leave} />
      ) : null;
    }
    case "gameOver": {
      return career ? (
        <GameOverScreen
          career={career}
          onBackRoom={flow.leave}
          onNewCareer={flow.newCareer}
        />
      ) : null;
    }
    case "results": {
      return (
        <ResultsScreen
          canRaceAgain={raceAgainOffered(view.report, career)}
          career={career}
          onContinue={flow.leave}
          onRaceAgain={() => {
            diagnostics().events.track({ event: "race_again" });
            flow.rideOut(view.report.mode, view.report.roadId);
          }}
          repeatRun={
            view.report.ledger !== null &&
            career?.qualified[career.tier][view.report.roadId] !== undefined
          }
          report={view.report}
          riding={career?.bikeId ?? flow.pick.bikeId}
        />
      );
    }
    case "rideOut": {
      return rules ? (
        <RideOut
          career={career}
          failure={flow.failure}
          entry={view.entry}
          onBack={flow.leave}
          onPrepare={flow.prepare}
          onStart={flow.start}
          ready={flow.ready}
          rules={rules}
        />
      ) : null;
    }
    default: {
      return view satisfies never;
    }
  }
};

const RaceScreens = ({ flow }: { readonly flow: Flow }) => {
  const { view } = flow;
  if (view.screen !== "race") {
    return null;
  }
  const { plan, stage } = view;
  return (
    <>
      <RaceHud feed={flow.feed} settled={stage.kind === "finishing"} />
      {stage.kind === "finishing" && (
        <FinishBanner onContinue={flow.leave} report={stage.report} />
      )}
      {plan.room ? (
        <Suspense>
          <RoomRaceScreens
            feed={flow.feed}
            onLeave={flow.leaveRace}
            onMove={(visit) => {
              flow.send({ kind: "roomMoved", visit });
            }}
            onMute={flow.mute}
            onResume={flow.resume}
            room={plan.room}
            stage={stage}
          />
        </Suspense>
      ) : (
        stage.kind === "paused" && (
          <PauseScreen
            career={flow.career}
            feed={flow.feed}
            onMute={flow.mute}
            onQuit={() => {
              flow.quit(plan);
            }}
            onRestart={() => {
              flow.start(plan);
            }}
            onResume={flow.resume}
            plan={plan}
            rules={flow.rules}
          />
        )
      )}
    </>
  );
};

export const GameShell = () => {
  const flow = useFlow();
  const [atDoor, setAtDoor] = useState(false);
  const { send } = flow;
  const doorMoment = useCallback(
    (opened: boolean) => {
      setAtDoor(opened);
      if (opened) {
        send({ kind: "doorOpened" });
      }
    },
    [send]
  );
  return (
    <div className="bg-ink fixed inset-0 overflow-hidden select-none">
      <canvas
        aria-label="The race"
        className="block size-full"
        ref={flow.canvasRef}
      />
      {flow.view.screen === "bar" && (
        <BarHome
          atDoor={atDoor}
          flow={flow}
          onDoorMoment={doorMoment}
          view={flow.view}
        />
      )}
      <MenuScreens flow={flow} />
      <RaceScreens flow={flow} />
      {stageOf(flow.view) === "menu" && !atDoor && <DataNotice />}
      {flow.save.status === "ready" && flow.save.unsaved && (
        <p
          className="bg-red text-text text-label fixed top-0 left-1/2 z-50 -translate-x-1/2 px-4 py-1 font-semibold uppercase"
          role="alert"
        >
          The browser refused the save. Progress will be lost when you leave.
        </p>
      )}
    </div>
  );
};
