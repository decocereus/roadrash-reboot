import type { RaceRules } from "@racer/career/rules";
import type { CareerState } from "@racer/career/state";
import { acceptEnvelope, refuseEnvelope } from "@racer/career/story";
import { lazy, Suspense, useEffect, useState } from "react";

import { planFor } from "../career/flow.ts";
import type { RaceEntry } from "../career/flow.ts";
import { diagnostics } from "../diagnostics/hub.ts";
import type { RacePlan } from "../game/hud.ts";
import { raceAgainOffered, stageOf } from "../navigation.ts";
import type { RoomVisit, View } from "../navigation.ts";
import { preparedRace } from "../prepare-outcome.ts";
import type { PrepareOutcome } from "../prepare-outcome.ts";
import { stepRideOut } from "../race-handoff.ts";
import type { RideOutHandoff } from "../race-handoff.ts";
import { newRoomId } from "./room-url.ts";
import { BackRoomScreen } from "./screens/back-room.tsx";
import { BootScreen, ElsewhereScreen } from "./screens/boot.tsx";
import { ClubhouseScreen } from "./screens/clubhouse.tsx";
import { DataNotice } from "./screens/data-notice.tsx";
import { FinishBanner } from "./screens/finish.tsx";
import { EndingScreen, GameOverScreen } from "./screens/game-over.tsx";
import { GarageScreen } from "./screens/garage.tsx";
import { PauseScreen } from "./screens/pause.tsx";
import { RaceHud } from "./screens/race-hud.tsx";
import { ResultsScreen } from "./screens/results.tsx";
import { RideOutScreen } from "./screens/ride-out.tsx";
import { RouteBoardScreen } from "./screens/route-board.tsx";
import { useFlow } from "./use-flow.ts";
import type { Flow } from "./use-flow.ts";
import { useHandoff } from "./use-handoff.ts";

const drawsNothing = () => null;

const RoomLobby = import.meta.env.SSR
  ? drawsNothing
  : lazy(async () => {
      const { RoomLobby: lobby } = await import("./room-lobby.tsx");
      return { default: lobby };
    });

const QuickRace = import.meta.env.SSR
  ? drawsNothing
  : lazy(async () => {
      const { QuickRace: finding } = await import("./room-lobby.tsx");
      return { default: finding };
    });

const RoomRaceScreens = import.meta.env.SSR
  ? drawsNothing
  : lazy(async () => {
      const { RoomRaceScreens: screens } =
        await import("./room-race-screens.tsx");
      return { default: screens };
    });

const moveToRoom = (flow: Flow, visit: RoomVisit): void => {
  flow.send({ kind: "roomMoved", visit });
};

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

const CareerScreens = ({
  flow,
  rules,
  career,
  view,
}: {
  readonly flow: Flow;
  readonly rules: RaceRules;
  readonly career: CareerState;
  readonly view: Extract<
    View,
    { readonly screen: "clubhouse" | "ending" | "gameOver" | "garage" }
  >;
}) => {
  switch (view.screen) {
    case "clubhouse": {
      return (
        <ClubhouseScreen
          career={career}
          onBackRoom={flow.leave}
          onFriends={() => {
            diagnostics().events.track({
              choice: "friends",
              event: "race_picked",
            });
            moveToRoom(flow, {
              arrival: "made",
              rejoin: null,
              roomId: newRoomId(),
            });
          }}
          onFindRace={() => {
            diagnostics().events.track({
              choice: "public",
              event: "race_picked",
            });
            flow.send({ kind: "picked", screen: "queue" });
          }}
          onEnvelope={(take) => {
            flow.commit(take ? acceptEnvelope(career) : refuseEnvelope(career));
          }}
          onGarage={() => {
            flow.send({ kind: "picked", screen: "garage" });
          }}
          onRide={(roadId) => {
            diagnostics().events.track({
              choice: "career",
              event: "race_picked",
            });
            flow.rideOut("career", roadId);
          }}
          promotion={view.promotion}
          rules={rules}
        />
      );
    }
    case "ending": {
      return <EndingScreen career={career} onBackRoom={flow.leave} />;
    }
    case "gameOver": {
      return (
        <GameOverScreen
          career={career}
          onBackRoom={flow.leave}
          onNewCareer={flow.newCareer}
        />
      );
    }
    case "garage": {
      return (
        <GarageScreen
          career={career}
          onBack={flow.leave}
          onTrade={flow.commit}
        />
      );
    }
    default: {
      return view satisfies never;
    }
  }
};

const MenuScreens = ({
  flow,
  onDoorMoment,
}: {
  readonly flow: Flow;
  readonly onDoorMoment: (atDoor: boolean) => void;
}) => {
  const { view, career, rules } = flow;
  if (view.screen === "boot") {
    return <BootScreen />;
  }
  if (view.screen === "elsewhere") {
    return <ElsewhereScreen />;
  }
  if (view.screen === "backRoom") {
    return (
      <BackRoomScreen
        failure={flow.failure}
        onContinue={flow.leave}
        onNewCareer={flow.newCareer}
        onQuickRace={() => {
          flow.send({ kind: "picked", screen: "routeBoard" });
        }}
        onStartOver={flow.eraseSave}
        save={flow.save}
      />
    );
  }
  if (!rules) {
    return null;
  }
  switch (view.screen) {
    case "clubhouse":
    case "ending":
    case "gameOver":
    case "garage": {
      return career ? (
        <CareerScreens career={career} flow={flow} rules={rules} view={view} />
      ) : null;
    }
    case "queue": {
      return (
        <Suspense>
          <QuickRace
            onBack={flow.leave}
            onPlaced={(roomId) => {
              moveToRoom(flow, { arrival: "queue", rejoin: null, roomId });
            }}
          />
        </Suspense>
      );
    }
    case "race": {
      return null;
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
      return (
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
      );
    }
    case "room": {
      return (
        <Suspense>
          <RoomLobby
            failure={flow.failure}
            key={view.turn}
            onBack={flow.leave}
            onDoorMoment={onDoorMoment}
            onLost={flow.roomLost}
            onMove={(visit) => {
              moveToRoom(flow, visit);
            }}
            onPrepare={flow.prepare}
            onStart={flow.start}
            ready={flow.ready}
            visit={view.visit}
          />
        </Suspense>
      );
    }
    case "routeBoard": {
      return (
        <RouteBoardScreen
          career={career}
          onBack={flow.leave}
          onPick={flow.setPick}
          onRace={() => {
            diagnostics().events.track({
              choice: "single",
              event: "race_picked",
            });
            flow.rideOut("quick", flow.pick.roadId);
          }}
          pick={flow.pick}
          ready={flow.ready}
          rules={rules}
        />
      );
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
              moveToRoom(flow, visit);
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
  return (
    <div className="bg-ink fixed inset-0 overflow-hidden select-none">
      <canvas
        aria-label="The race"
        className="block size-full"
        ref={flow.canvasRef}
      />
      <MenuScreens flow={flow} onDoorMoment={setAtDoor} />
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
