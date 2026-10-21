import { billConsequence } from "@racer/career/settle";
import type { CareerState } from "@racer/career/state";
import { repairBill } from "@racer/career/tables";
import { Confirm } from "@racer/ui/components/confirm";
import { Heading } from "@racer/ui/components/heading";
import { formatMoney } from "@racer/ui/components/money";
import { Panel } from "@racer/ui/components/panel";
import { Screen } from "@racer/ui/components/screen";
import { useState, useSyncExternalStore } from "react";

import { billWarning, CONTROLS } from "../../career/copy.ts";
import { bikeName } from "../../career/format.ts";
import { idleHud } from "../../game/hud.ts";
import type { HudFeed, RacePlan } from "../../game/hud.ts";
import { SettingsScreen } from "./settings.tsx";
import { ActionMenu, useEscape } from "./shared.tsx";
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
  if (adjusting) {
    return (
      <SettingsScreen
        onBack={() => {
          setAdjusting(false);
        }}
      />
    );
  }
  return (
    <Screen className="bg-ink/60">
      <Panel
        className="p-gutter flex h-full w-[min(26rem,36vw)] flex-col gap-6 border-y-0 border-l-0"
        inert={asking ? true : undefined}
        padding="none"
      >
        <Heading as="h1">Paused</Heading>
        <ActionMenu
          actions={actions}
          className="w-full"
          label="Pause"
          orientation="vertical"
          primary="resume"
          size="md"
        />
        <div className="text-muted mt-auto flex flex-col gap-2 text-sm font-semibold">
          <p>{CONTROLS} · M to mute</p>
          {racing ? (
            <p>
              Leaving or reloading the page during a race counts as a wreck too.
            </p>
          ) : (
            <p>R restarts a single race.</p>
          )}
        </div>
      </Panel>
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
