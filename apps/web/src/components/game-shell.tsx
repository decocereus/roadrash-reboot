import { roadOpen } from "@racer/career/field";
import type { RaceRules } from "@racer/career/rules";
import type { CareerState } from "@racer/career/state";
import { acceptEnvelope, refuseEnvelope } from "@racer/career/story";
import { lazy, Suspense, useEffect, useRef, useState } from "react";

import { planFor } from "../career/flow.ts";
import type { RaceEntry, RaceReport } from "../career/flow.ts";
import { diagnostics } from "../diagnostics/hub.ts";
import type { RacePlan } from "../game/hud.ts";
import { preparedRace } from "../prepare-outcome.ts";
import type { PrepareOutcome } from "../prepare-outcome.ts";
import { moveToRoom, newRoomId } from "./room-url.ts";
import { BackRoomScreen } from "./screens/back-room.tsx";
import { BootScreen } from "./screens/boot.tsx";
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
import {
  afterResults,
  backRoom,
  clubhouse,
  homeOf,
  singleRace,
  useFlow,
} from "./use-flow.ts";
import type { Flow } from "./use-flow.ts";

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
  const [plan] = useState(() => planFor(rules, career, entry));
  const [prepared, setPrepared] = useState(false);
  const [dwelt, setDwelt] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const started = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDwelt(true);
    }, DWELL_MS);
    return () => {
      clearTimeout(timer);
    };
  }, []);
  useEffect(() => {
    if (prepared && dwelt && !started.current) {
      started.current = true;
      onStart(plan);
    }
  }, [prepared, dwelt, plan, onStart]);
  useEffect(() => {
    let current = true;
    const prepare = async (): Promise<void> => {
      const race = preparedRace(await onPrepare(plan));
      if (!current) {
        return;
      }
      switch (race) {
        case "built": {
          setPrepared(true);
          break;
        }
        case "missing": {
          setLoadFailed(true);
          break;
        }
        case "cancelled": {
          break;
        }
        default: {
          race satisfies never;
        }
      }
    };
    if (ready) {
      void prepare();
    }
    return () => {
      current = false;
    };
  }, [ready, plan, onPrepare, attempt]);
  return (
    <RideOutScreen
      career={career}
      failure={failure}
      loadFailed={loadFailed}
      onBack={onBack}
      onRetry={() => {
        setLoadFailed(false);
        setAttempt((tried) => tried + 1);
      }}
      plan={plan}
      ready={ready && prepared}
    />
  );
};

const CareerScreens = ({
  flow,
  rules,
  career,
}: {
  readonly flow: Flow;
  readonly rules: RaceRules;
  readonly career: CareerState;
}) => {
  const { view } = flow;
  if (view.screen === "clubhouse") {
    return (
      <ClubhouseScreen
        career={career}
        onBackRoom={() => {
          flow.go(backRoom);
        }}
        onFriends={() => {
          diagnostics().events.track({
            choice: "friends",
            event: "race_picked",
          });
          moveToRoom(newRoomId(), "made");
        }}
        onFindRace={() => {
          diagnostics().events.track({
            choice: "public",
            event: "race_picked",
          });
          flow.go({ screen: "queue" });
        }}
        onEnvelope={(take) => {
          flow.commit(take ? acceptEnvelope(career) : refuseEnvelope(career));
        }}
        onGarage={() => {
          flow.go({ screen: "garage" });
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
  if (view.screen === "garage") {
    return (
      <GarageScreen
        career={career}
        onBack={() => {
          flow.go(clubhouse);
        }}
        onTrade={flow.commit}
      />
    );
  }
  if (view.screen === "ending") {
    return (
      <EndingScreen
        career={career}
        onBackRoom={() => {
          flow.go(backRoom);
        }}
      />
    );
  }
  if (view.screen === "gameOver") {
    return (
      <GameOverScreen
        career={career}
        onBackRoom={() => {
          flow.go(backRoom);
        }}
        onNewCareer={flow.newCareer}
      />
    );
  }
  return null;
};

const raceAgainOffered = (
  report: RaceReport,
  career: CareerState | null
): boolean =>
  report.ledger === null ||
  (career !== null &&
    afterResults(report) === clubhouse &&
    roadOpen(career, report.roadId));

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
  if (view.screen === "backRoom") {
    return (
      <BackRoomScreen
        failure={flow.failure}
        onContinue={() => {
          if (career) {
            flow.go(homeOf(career));
          }
        }}
        onNewCareer={flow.newCareer}
        onQuickRace={() => {
          flow.go(singleRace);
        }}
        onStartOver={flow.eraseSave}
        save={flow.save}
      />
    );
  }
  if (!rules) {
    return null;
  }
  if (view.screen === "routeBoard") {
    return (
      <RouteBoardScreen
        career={career}
        onBack={() => {
          flow.go(backRoom);
        }}
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
  if (view.screen === "queue") {
    return (
      <Suspense>
        <QuickRace
          onBack={() => {
            flow.go(clubhouse);
          }}
        />
      </Suspense>
    );
  }
  if (view.screen === "room") {
    return (
      <Suspense>
        <RoomLobby
          onBack={() => {
            globalThis.location.assign("/");
          }}
          onDoorMoment={onDoorMoment}
          onLost={flow.roomLost}
          onPrepare={flow.prepare}
          onStart={flow.start}
          roomId={view.roomId}
          ready={flow.ready}
        />
      </Suspense>
    );
  }
  if (view.screen === "rideOut") {
    return (
      <RideOut
        career={career}
        failure={flow.failure}
        entry={view.entry}
        onBack={() => {
          flow.go(view.entry.mode === "career" ? clubhouse : singleRace);
        }}
        onPrepare={flow.prepare}
        onStart={flow.start}
        ready={flow.ready}
        rules={rules}
      />
    );
  }
  if (view.screen === "results") {
    return (
      <ResultsScreen
        canRaceAgain={raceAgainOffered(view.report, career)}
        career={career}
        onContinue={() => {
          if (view.report.room) {
            globalThis.location.assign("/");
          } else {
            flow.go(afterResults(view.report));
          }
        }}
        onRaceAgain={() => {
          diagnostics().events.track({ event: "race_again" });
          if (view.report.room) {
            moveToRoom(view.report.room.roomId, "rematch");
          } else {
            flow.rideOut(view.report.mode, view.report.roadId);
          }
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
  return career ? (
    <CareerScreens career={career} flow={flow} rules={rules} />
  ) : null;
};

const RaceScreens = ({ flow }: { readonly flow: Flow }) => {
  const { view } = flow;
  if (view.screen !== "race") {
    return null;
  }
  const { finish } = view;
  return (
    <>
      <RaceHud feed={flow.feed} settled={finish !== null} />
      {finish && (
        <FinishBanner
          onContinue={() => {
            flow.go({ report: finish, screen: "results" });
          }}
          report={finish}
        />
      )}
      {view.paused && (
        <PauseScreen
          career={flow.career}
          feed={flow.feed}
          onMute={flow.mute}
          onQuit={() => {
            flow.quit(view.plan);
          }}
          onRestart={() => {
            flow.start(view.plan);
          }}
          onResume={flow.resume}
          plan={view.plan}
          rules={flow.rules}
        />
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
      {flow.view.screen !== "boot" &&
        flow.view.screen !== "race" &&
        !atDoor && <DataNotice />}
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
