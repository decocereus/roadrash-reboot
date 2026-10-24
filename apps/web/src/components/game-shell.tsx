import { roadOpen } from "@racer/career/field";
import type { RaceRules } from "@racer/career/rules";
import type { CareerState } from "@racer/career/state";
import { acceptEnvelope, refuseEnvelope } from "@racer/career/story";
import { useEffect, useRef, useState } from "react";

import { planFor } from "../career/flow.ts";
import type { RaceEntry, RaceReport } from "../career/flow.ts";
import type { RacePlan } from "../game/hud.ts";
import type { PrepareOutcome } from "../game/preparation.ts";
import { BackRoomScreen } from "./screens/back-room.tsx";
import { BootScreen } from "./screens/boot.tsx";
import { ClubhouseScreen } from "./screens/clubhouse.tsx";
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
      const outcome = await onPrepare(plan);
      if (current && outcome.kind !== "cancelled") {
        setPrepared(true);
      }
    };
    if (ready) {
      void prepare();
    }
    return () => {
      current = false;
    };
  }, [ready, plan, onPrepare]);
  return (
    <RideOutScreen
      career={career}
      failure={failure}
      onBack={onBack}
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
        onEnvelope={(take) => {
          flow.commit(take ? acceptEnvelope(career) : refuseEnvelope(career));
        }}
        onGarage={() => {
          flow.go({ screen: "garage" });
        }}
        onRide={(roadId) => {
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
        rules={rules}
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
        rules={rules}
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
        rules={rules}
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
  rules: RaceRules,
  report: RaceReport,
  career: CareerState | null
): boolean =>
  report.ledger === null ||
  (career !== null &&
    afterResults(report) === clubhouse &&
    roadOpen(rules, career, report.roadId));

const MenuScreens = ({ flow }: { readonly flow: Flow }) => {
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
        rules={rules}
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
          flow.rideOut("quick", flow.pick.roadId);
        }}
        pick={flow.pick}
        ready={flow.ready}
        rules={rules}
      />
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
        canRaceAgain={raceAgainOffered(rules, view.report, career)}
        career={career}
        onContinue={() => {
          flow.go(afterResults(view.report));
        }}
        onRaceAgain={() => {
          flow.rideOut(view.report.mode, view.report.roadId);
        }}
        repeatRun={
          view.report.ledger !== null &&
          career?.qualified[career.level][view.report.roadId] !== undefined
        }
        report={view.report}
        riding={career?.bikeId ?? flow.pick.bikeId}
        rules={rules}
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
      <RaceHud
        feed={flow.feed}
        settled={finish !== null}
        tagRef={flow.followRival}
      />
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
  return (
    <div className="bg-ink fixed inset-0 overflow-hidden select-none">
      <canvas
        aria-label="The race"
        className="block size-full"
        ref={flow.canvasRef}
      />
      <MenuScreens flow={flow} />
      <RaceScreens flow={flow} />
      {flow.unsaved && (
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
