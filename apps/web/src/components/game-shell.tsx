import { lazy, Suspense, useCallback, useState } from "react";

import { stageOf } from "../navigation.ts";
import { BarHome } from "./bar-home.tsx";
import { BootScreen, ElsewhereScreen } from "./screens/boot.tsx";
import { DataNotice } from "./screens/data-notice.tsx";
import { FinishBanner } from "./screens/finish.tsx";
import { PauseScreen } from "./screens/pause.tsx";
import { RaceHud } from "./screens/race-hud.tsx";
import { useFlow } from "./use-flow.ts";
import type { Flow } from "./use-flow.ts";

const drawsNothing = () => null;

const RoomRaceScreens = import.meta.env.SSR
  ? drawsNothing
  : lazy(async () => {
      const { RoomRaceScreens: screens } =
        await import("./room-race-screens.tsx");
      return { default: screens };
    });

const MenuScreens = ({ flow }: { readonly flow: Flow }) => {
  switch (flow.view.screen) {
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
    default: {
      return flow.view satisfies never;
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
        <FinishBanner onContinue={flow.moveOn} report={stage.report} />
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
  const [roomAtDoor, setAtDoor] = useState(false);
  const { send, view } = flow;
  const atDoor =
    roomAtDoor || (view.screen === "bar" && view.panel.kind === "door");
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
