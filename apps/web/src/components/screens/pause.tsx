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
import { SettingsScreen } from "./settings.tsx";
import { useEscape } from "./shared.tsx";
import type { MenuAction } from "./shared.tsx";

export const PauseScreen = ({
  plan,
  career,
  feed,
  onResume,
  onRestart,
  onMute,
  onQuit,
}: {
  readonly plan: RacePlan;
  readonly career: CareerState | null;
  readonly feed: HudFeed;
  readonly onResume: () => void;
  readonly onRestart: () => void;
  readonly onMute: () => void;
  readonly onQuit: () => void;
}) => {
  const [asking, setAsking] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const hud = useSyncExternalStore(feed.subscribe, feed.read, () => idleHud);
  const racing = plan.mode === "career" && career !== null;
  const bill = racing ? repairBill(career.level, career.bikeId) : 0;
  useEscape(onResume, !(asking || adjusting));
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
        setAdjusting(true);
      },
    },
    {
      id: "quit",
      label: "Quit race",
      run: () => {
        setAsking(true);
      },
    },
  ];
  return (
    <Screen className="bg-ink/60 flex">
      <Stage inert={asking || adjusting ? true : undefined}>
        <PinnedList
          actions={actions}
          autoFocus={!adjusting}
          label="Pause"
          primary="resume"
          title="Paused"
        />
        <BarStrip>
          <p
            className="text-paper/60 tracking-wide"
            style={{ fontSize: stagePx(22) }}
          >
            {CONTROLS} · M to mute
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
      {adjusting && (
        <SettingsScreen
          onBack={() => {
            setAdjusting(false);
          }}
        />
      )}
      {asking && (
        <Confirm
          defaultValue="keep"
          label="Quit race"
          onDismiss={() => {
            setAsking(false);
          }}
          onSelect={(value) => {
            setAsking(false);
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
