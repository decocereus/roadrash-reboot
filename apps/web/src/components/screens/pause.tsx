import type { RaceRules } from "@racer/career/rules";
import { billConsequence } from "@racer/career/settle";
import type { CareerState } from "@racer/career/state";
import { repairBill } from "@racer/career/tables";
import { formatMoney } from "@racer/ui/components/money";
import { Screen } from "@racer/ui/components/screen";
import { useState, useSyncExternalStore } from "react";

import { billWarning, CONTROLS } from "../../career/copy.ts";
import { bikeName } from "../../career/format.ts";
import type { RacePlan } from "../../game/hud.ts";
import { idleHud } from "../../hud-feed.ts";
import type { HudFeed } from "../../hud-feed.ts";
import { BarStrip } from "./bar-chrome.tsx";
import { Stage, stagePx } from "./clubhouse-stage.tsx";
import { Confirm } from "./confirm.tsx";
import { PinnedList } from "./pinned-list.tsx";
import { SettingsOverlay } from "./settings.tsx";
import { useEscape } from "./shared.tsx";
import type { MenuAction } from "./shared.tsx";

const overlays = ["nothing", "settings", "quit"] as const;

type Overlay = (typeof overlays)[number];

export const PauseScreen = ({
  plan,
  career,
  rules,
  feed,
  onResume,
  onRestart,
  onMute,
  onQuit,
}: {
  readonly plan: RacePlan;
  readonly career: CareerState | null;
  readonly rules: RaceRules | null;
  readonly feed: HudFeed;
  readonly onResume: () => void;
  readonly onRestart: () => void;
  readonly onMute: () => void;
  readonly onQuit: () => void;
}) => {
  const [overlay, setOverlay] = useState<Overlay>("nothing");
  const hud = useSyncExternalStore(feed.subscribe, feed.read, () => idleHud);
  const racing = plan.mode === "career" && career !== null && rules !== null;
  const bill = racing ? repairBill(career.tier, career.bikeId) : 0;
  useEscape(onResume, overlay === "nothing");
  const actions: MenuAction[] = [
    { id: "resume", label: "Resume", run: onResume },
    ...(racing
      ? []
      : [{ id: "restart", label: "Restart race", run: onRestart }]),
    {
      id: "sound",
      label: "Sound",
      run: onMute,
      trailing: hud.muted ? "Off" : "On",
    },
    {
      id: "settings",
      label: "Settings",
      run: () => {
        setOverlay("settings");
      },
    },
    {
      id: "quit",
      label: "Quit race",
      run: () => {
        setOverlay("quit");
      },
    },
  ];
  return (
    <Screen className="bg-ink/60 flex">
      <Stage inert={overlay === "nothing" ? undefined : true}>
        <PinnedList
          actions={actions}
          autoFocus={overlay !== "settings"}
          label="Pause"
          primary="resume"
          title="Paused"
        />
        <BarStrip>
          <p
            className="text-paper/60 tracking-wide"
            style={{ fontSize: stagePx(22) }}
          >
            {CONTROLS}, M to mute
          </p>
          <p
            className="text-paper/60 tracking-wide"
            style={{ fontSize: stagePx(22) }}
          >
            {racing
              ? "Leaving or reloading the page counts as a wreck too"
              : "R restarts a single race"}
          </p>
        </BarStrip>
      </Stage>
      {overlay === "settings" && (
        <SettingsOverlay
          muted={hud.muted}
          onBack={() => {
            setOverlay("nothing");
          }}
          onMute={onMute}
        />
      )}
      {overlay === "quit" && (
        <Confirm
          defaultValue="keep"
          label="Quit race"
          onDismiss={() => {
            setOverlay("nothing");
          }}
          onSelect={(value) => {
            setOverlay("nothing");
            if (value === "quit") {
              onQuit();
            }
          }}
          options={[
            { label: "Keep racing", value: "keep" },
            { label: racing ? "Quit and pay" : "Quit", value: "quit" },
          ]}
          warning={
            racing
              ? billWarning(
                  billConsequence(career, bill),
                  "bill",
                  bikeName(career.bikeId)
                )
              : undefined
          }
        >
          {racing
            ? `Quit this race? It counts as a wreck: no prize, and a ${formatMoney(bill)} repair bill.`
            : "Quit this race?"}
        </Confirm>
      )}
    </Screen>
  );
};

export const RaceMenu = ({
  feed,
  onResume,
  onMute,
  onLeave,
}: {
  readonly feed: HudFeed;
  readonly onResume: () => void;
  readonly onMute: () => void;
  readonly onLeave: () => void;
}) => {
  const [settings, setSettings] = useState(false);
  const hud = useSyncExternalStore(feed.subscribe, feed.read, () => idleHud);
  useEscape(onResume, !settings);
  const actions: MenuAction[] = [
    { id: "resume", label: "Back to the race", run: onResume },
    {
      id: "sound",
      label: "Sound",
      run: onMute,
      trailing: hud.muted ? "Off" : "On",
    },
    {
      id: "settings",
      label: "Settings",
      run: () => {
        setSettings(true);
      },
    },
    {
      detail: "Back to the bar. Your bike rides on without you.",
      id: "leave",
      label: "Leave race",
      run: onLeave,
    },
  ];
  return (
    <Screen className="bg-ink/60 flex">
      <Stage inert={settings ? true : undefined}>
        <PinnedList
          actions={actions}
          autoFocus={!settings}
          label="Race menu"
          primary="resume"
          title="Race menu"
        />
        <BarStrip>
          <p
            className="text-paper/60 tracking-wide"
            style={{ fontSize: stagePx(22) }}
          >
            The race keeps going.
          </p>
          <p
            className="text-paper/60 tracking-wide"
            style={{ fontSize: stagePx(22) }}
          >
            {CONTROLS}, M to mute
          </p>
        </BarStrip>
      </Stage>
      {settings && (
        <SettingsOverlay
          muted={hud.muted}
          onBack={() => {
            setSettings(false);
          }}
          onMute={onMute}
        />
      )}
    </Screen>
  );
};
