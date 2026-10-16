import { roadOpen, roadsFor } from "@racer/career/field";
import type { CareerState } from "@racer/career/state";
import { acceptEnvelope, refuseEnvelope } from "@racer/career/story";
import { useEffect, useState } from "react";

import { planFor } from "../career/flow.ts";
import type { RaceEntry, RaceReport } from "../career/flow.ts";
import type { RacePlan } from "../game/hud.ts";
import { BustedScreen } from "./screens/busted.tsx";
import { ClubhouseScreen } from "./screens/clubhouse.tsx";
import { FinishBanner } from "./screens/finish.tsx";
import { EndingScreen, GameOverScreen } from "./screens/game-over.tsx";
import { GarageScreen } from "./screens/garage.tsx";
import { IntroScreen } from "./screens/intro.tsx";
import { LevelUpScreen } from "./screens/level-up.tsx";
import { PauseScreen } from "./screens/pause.tsx";
import { PreRaceScreen } from "./screens/pre-race.tsx";
import { RaceHud } from "./screens/race-hud.tsx";
import { ResultsScreen } from "./screens/results.tsx";
import { RouteBoardScreen } from "./screens/route-board.tsx";
import { TitleScreen } from "./screens/title.tsx";
import { WreckedScreen } from "./screens/wrecked.tsx";
import { afterResults, clubhouse, homeOf, title, useFlow } from "./use-flow.ts";
import type { Flow } from "./use-flow.ts";

function PreRace({
  career,
  entry,
  ready,
  onPrepare,
  onStart,
  onBack,
}: {
  readonly career: CareerState | null;
  readonly entry: RaceEntry;
  readonly ready: boolean;
  readonly onPrepare: (plan: RacePlan) => void;
  readonly onStart: (plan: RacePlan) => void;
  readonly onBack: () => void;
}) {
  const [plan] = useState(() => planFor(career, entry));
  useEffect(() => {
    if (ready) {
      onPrepare(plan);
    }
  }, [ready, plan, onPrepare]);
  return (
    <PreRaceScreen
      career={career}
      onBack={onBack}
      onStart={() => onStart(plan)}
      plan={plan}
      ready={ready}
    />
  );
}

function CareerScreens({
  flow,
  career,
}: {
  readonly flow: Flow;
  readonly career: CareerState;
}) {
  const { view } = flow;
  if (view.screen === "clubhouse") {
    return (
      <ClubhouseScreen
        career={career}
        onEnvelope={(take) =>
          flow.commit(take ? acceptEnvelope(career) : refuseEnvelope(career))
        }
        onGarage={() => flow.go({ screen: "garage" })}
        onRouteBoard={() => {
          flow.setPick({
            ...flow.pick,
            roadId: roadsFor(career).next ?? flow.pick.roadId,
          });
          flow.go({ mode: "career", screen: "routeBoard" });
        }}
        onTitle={() => flow.go(title)}
      />
    );
  }
  if (view.screen === "garage") {
    return (
      <GarageScreen
        career={career}
        onBack={() => flow.go(clubhouse)}
        onTrade={flow.commit}
      />
    );
  }
  if (view.screen === "wrecked") {
    return (
      <WreckedScreen
        career={career}
        onPay={() => flow.payRepair(view.outcome)}
        outcome={view.outcome}
      />
    );
  }
  if (view.screen === "ending") {
    return <EndingScreen career={career} onTitle={() => flow.go(title)} />;
  }
  if (view.screen === "gameOver") {
    return (
      <GameOverScreen
        career={career}
        onNewCareer={flow.newCareer}
        onTitle={() => flow.go(title)}
      />
    );
  }
  return null;
}

const raceAgainOffered = (
  report: RaceReport,
  career: CareerState | null
): boolean =>
  report.ledger === null ||
  (career !== null &&
    afterResults(report) === clubhouse &&
    roadOpen(career, report.roadId));

function MenuScreens({ flow }: { readonly flow: Flow }) {
  const { view, career } = flow;
  if (view.screen === "title") {
    return (
      <TitleScreen
        failure={flow.failure}
        onContinue={() => career && flow.go(homeOf(career))}
        onNewCareer={flow.newCareer}
        onQuickRace={() => flow.go({ mode: "quick", screen: "routeBoard" })}
        onStartOver={flow.eraseSave}
        save={flow.save}
      />
    );
  }
  if (view.screen === "intro") {
    return <IntroScreen onDone={() => flow.go(clubhouse)} />;
  }
  if (view.screen === "routeBoard") {
    return (
      <RouteBoardScreen
        career={career}
        mode={view.mode}
        onBack={() => flow.go(view.mode === "career" ? clubhouse : title)}
        onPick={flow.setPick}
        onRace={() => flow.preRace(view.mode, flow.pick.roadId)}
        pick={flow.pick}
        ready={flow.ready}
      />
    );
  }
  if (view.screen === "preRace") {
    return (
      <PreRace
        career={career}
        entry={view.entry}
        onBack={() => flow.go({ mode: view.entry.mode, screen: "routeBoard" })}
        onPrepare={flow.prepare}
        onStart={flow.start}
        ready={flow.ready}
      />
    );
  }
  if (view.screen === "busted") {
    return (
      <BustedScreen
        onPay={() => flow.go({ report: view.report, screen: "results" })}
        report={view.report}
      />
    );
  }
  if (view.screen === "results") {
    return (
      <ResultsScreen
        canRaceAgain={raceAgainOffered(view.report, career)}
        onContinue={() => flow.go(afterResults(view.report))}
        onRaceAgain={() => flow.preRace(view.report.mode, view.report.roadId)}
        repeatRun={
          view.report.ledger !== null &&
          career?.qualified[career.level][view.report.roadId] !== undefined
        }
        report={view.report}
        riding={career?.bikeId ?? flow.pick.bikeId}
      />
    );
  }
  if (view.screen === "levelUp" && view.report.ledger?.levelUp) {
    return (
      <LevelUpScreen
        levelUp={view.report.ledger.levelUp}
        onDone={() => flow.go(clubhouse)}
      />
    );
  }
  return career ? <CareerScreens career={career} flow={flow} /> : null;
}

function RaceScreens({ flow }: { readonly flow: Flow }) {
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
          onContinue={() => flow.go({ report: finish, screen: "results" })}
          report={finish}
        />
      )}
      {view.paused && (
        <PauseScreen
          career={flow.career}
          feed={flow.feed}
          onMute={flow.mute}
          onQuit={() => flow.quit(view.plan)}
          onRestart={() => flow.start(view.plan)}
          onResume={flow.resume}
          plan={view.plan}
        />
      )}
    </>
  );
}

export function GameShell() {
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
}
