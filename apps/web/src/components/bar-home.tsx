import type { RoomSeat } from "@racer/rooms/seat-client";
import { HintStrip, Key } from "@racer/ui/components/hint-strip";
import { Panel } from "@racer/ui/components/kit-panel";
import { TabStrip } from "@racer/ui/components/tab-strip";
import {
  lazy,
  Suspense,
  useEffect,
  useReducer,
  useState,
  useSyncExternalStore,
} from "react";

import {
  barCameraLabels,
  barCameras,
  saveBarCamera,
  savedBarCamera,
  SOLO_SLOT,
} from "../bar-view.ts";
import type { BarCamera } from "../bar-view.ts";
import { diagnostics } from "../diagnostics/hub.ts";
import { idleHud } from "../hud-feed.ts";
import { barTabs } from "../navigation.ts";
import type { BarTab, BarView, RoomVisit } from "../navigation.ts";
import { BarStage } from "./bar-stage.tsx";
import { storedGuestName, watchGuestName } from "./guest-name.ts";
import { newRoomId } from "./room-url.ts";
import { GarageScreen } from "./screens/garage.tsx";
import { HomePanel, SoloPanel } from "./screens/race-panel.tsx";
import { SettingsPanel } from "./screens/settings.tsx";
import { RiderChip, useEscape } from "./screens/shared.tsx";
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

const RoomInvite = import.meta.env.SSR
  ? drawsNothing
  : lazy(async () => {
      const { RoomInvite: invite } = await import("./room-lobby.tsx");
      return { default: invite };
    });

const NEXT_CAMERA_KEY = "KeyC";
const REDRAW_MS = 1000;
const PANEL_ID = "bar-panel";

const tabLabels = {
  garage: "Garage",
  race: "Race",
  settings: "Settings",
} as const satisfies Record<BarTab, string>;

const moveToRoom = (flow: Flow, visit: RoomVisit): void => {
  flow.send({ kind: "roomMoved", visit });
};

const nextCamera = (camera: BarCamera): BarCamera =>
  barCameras[(barCameras.indexOf(camera) + 1) % barCameras.length] ?? "angled";

const useGuestName = (): string | null =>
  useSyncExternalStore(watchGuestName, storedGuestName, () => null);

const useCamera = (): readonly [BarCamera, (camera: BarCamera) => void] => {
  const [camera, setCamera] = useState<BarCamera>(savedBarCamera);
  const pick = (next: BarCamera): void => {
    setCamera(next);
    saveBarCamera(next);
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (
        event.code === NEXT_CAMERA_KEY &&
        !event.repeat &&
        !event.metaKey &&
        !(event.target instanceof HTMLInputElement)
      ) {
        setCamera((current) => {
          const next = nextCamera(current);
          saveBarCamera(next);
          return next;
        });
      }
    };
    globalThis.addEventListener("keydown", onKey);
    return () => {
      globalThis.removeEventListener("keydown", onKey);
    };
  }, []);
  return [camera, pick];
};

const colourOf = (seat: RoomSeat | null): number => {
  const lobby = seat?.lobby() ?? null;
  return (
    lobby?.members.find((member) => member.id === lobby.you)?.colour ??
    SOLO_SLOT
  );
};

const every = (ms: number, tick: () => void): (() => void) => {
  const ticking = setInterval(tick, ms);
  return () => {
    clearInterval(ticking);
  };
};

const useSeat = (): readonly [
  RoomSeat | null,
  (seat: RoomSeat | null) => void,
] => {
  const [seat, setSeat] = useState<RoomSeat | null>(null);
  const [, redraw] = useReducer((count: number) => count + 1, 0);
  useEffect(
    () => (seat === null ? undefined : every(REDRAW_MS, redraw)),
    [seat]
  );
  return [seat, setSeat];
};

const RaceTab = ({
  flow,
  view,
  shown,
  onDoorMoment,
  onSeat,
}: {
  readonly flow: Flow;
  readonly view: BarView;
  readonly shown: boolean;
  readonly onDoorMoment: (atDoor: boolean) => void;
  readonly onSeat: (seat: RoomSeat | null) => void;
}) => {
  const { panel } = view;
  switch (panel.kind) {
    case "home": {
      return (
        <Panel aria-label="Race" hidden={!shown}>
          <HomePanel
            failure={flow.failure}
            onFind={() => {
              diagnostics().events.track({
                choice: "public",
                event: "race_picked",
              });
              flow.send({ kind: "picked", panel: "finding" });
            }}
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
            onSolo={() => {
              flow.send({ kind: "picked", panel: "solo" });
            }}
            rules={flow.rules}
            save={flow.save}
          />
        </Panel>
      );
    }
    case "solo": {
      return (
        <Panel aria-label="Ride solo" hidden={!shown}>
          <SoloPanel
            failure={flow.failure}
            onBack={flow.leave}
            onNewCareer={flow.newCareer}
            onPick={flow.setPick}
            onRace={(roadId) => {
              diagnostics().events.track({
                choice: "single",
                event: "race_picked",
              });
              flow.rideOut("quick", roadId);
            }}
            onRide={(roadId) => {
              diagnostics().events.track({
                choice: "career",
                event: "race_picked",
              });
              flow.rideOut("career", roadId);
            }}
            onStartOver={flow.eraseSave}
            pick={flow.pick}
            rules={flow.rules}
            save={flow.save}
          />
        </Panel>
      );
    }
    case "finding": {
      return (
        <Suspense>
          <QuickRace
            onBack={flow.leave}
            onPlaced={(roomId) => {
              moveToRoom(flow, { arrival: "queue", rejoin: null, roomId });
            }}
            shown={shown}
          />
        </Suspense>
      );
    }
    case "invite": {
      return (
        <Suspense>
          <RoomInvite
            onJoin={() => {
              flow.send({ kind: "joined" });
            }}
            onNotNow={flow.leave}
            roomId={panel.roomId}
            shown={shown}
          />
        </Suspense>
      );
    }
    case "lobby": {
      return (
        <Suspense>
          <RoomLobby
            failure={flow.failure}
            key={panel.turn}
            onBack={flow.leave}
            onDoorMoment={onDoorMoment}
            onLost={flow.roomLost}
            onMove={(visit) => {
              moveToRoom(flow, visit);
            }}
            onPrepare={flow.prepare}
            onSeat={onSeat}
            onStart={flow.start}
            ready={flow.ready}
            shown={shown}
            visit={panel.visit}
          />
        </Suspense>
      );
    }
    default: {
      return panel satisfies never;
    }
  }
};

export const BarHome = ({
  flow,
  view,
  atDoor,
  onDoorMoment,
}: {
  readonly flow: Flow;
  readonly view: BarView;
  readonly atDoor: boolean;
  readonly onDoorMoment: (atDoor: boolean) => void;
}) => {
  const [camera, pickCamera] = useCamera();
  const [seat, setSeat] = useSeat();
  const name = useGuestName();
  const hud = useSyncExternalStore(
    flow.feed.subscribe,
    flow.feed.read,
    () => idleHud
  );
  const { career } = flow;
  useEscape(
    flow.leave,
    view.tab === "settings" ||
      (view.tab === "race" && view.panel.kind === "solo")
  );
  return (
    <main aria-label="The Lowside" className="bg-ink fixed inset-0">
      <BarStage camera={camera} seat={seat} />
      {!atDoor && (
        <>
          <TabStrip
            className="absolute inset-x-0 top-0"
            label="The bar"
            onChange={(tab) => {
              flow.send({ kind: "tabbed", tab });
            }}
            panelId={PANEL_ID}
            tabs={barTabs.map((tab) => ({
              disabled: tab === "garage" && career === null,
              label: tabLabels[tab],
              value: tab,
            }))}
            value={view.tab}
          >
            {name !== null && (
              <>
                <RiderChip colour={colourOf(seat)} />
                Riding as {name}
              </>
            )}
          </TabStrip>
          <HintStrip
            className="absolute inset-x-0 bottom-0"
            end={
              <>
                Camera <Key>C</Key> {barCameraLabels[camera]}
              </>
            }
            start={
              <>
                <Key>WASD</Key> or click to move <Key>E</Key> greets or sits{" "}
                <Key>F</Key> shoves
              </>
            }
          />
        </>
      )}
      <div
        aria-label={tabLabels[view.tab]}
        className="pointer-events-none absolute top-16 right-4 bottom-16 flex flex-col items-end [&>*]:pointer-events-auto"
        id={PANEL_ID}
        role="tabpanel"
      >
        <RaceTab
          flow={flow}
          onDoorMoment={onDoorMoment}
          onSeat={setSeat}
          shown={view.tab === "race" && !atDoor}
          view={view}
        />
        {view.tab === "settings" && !atDoor && (
          <SettingsPanel
            camera={camera}
            muted={hud.muted}
            onBack={null}
            onCamera={pickCamera}
            onMute={flow.mute}
            onNewCareer={flow.save.status === "ready" ? flow.newCareer : null}
          />
        )}
      </div>
      {view.tab === "garage" && career && !atDoor && (
        <GarageScreen
          career={career}
          onBack={flow.leave}
          onTrade={flow.commit}
        />
      )}
    </main>
  );
};
