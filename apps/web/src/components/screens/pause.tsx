import type { RaceRules } from "@racer/career/rules";
import { billConsequence } from "@racer/career/settle";
import type { CareerState } from "@racer/career/state";
import { repairBill } from "@racer/career/tables";
import {
  Card,
  PanelLine,
  PanelRule,
  PanelTitle,
} from "@racer/ui/components/kit-panel";
import { formatMoney } from "@racer/ui/components/money";
import { SkewButton } from "@racer/ui/components/skew-button";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

import { billWarning, CONTROLS } from "../../career/copy.ts";
import { bikeName } from "../../career/format.ts";
import type { RacePlan } from "../../game/hud.ts";
import { idleHud } from "../../hud-feed.ts";
import type { HudFeed } from "../../hud-feed.ts";
import { Confirm } from "./confirm.tsx";
import { SettingsOverlay } from "./settings.tsx";
import { useEscape } from "./shared.tsx";

const overlays = ["nothing", "settings", "quit"] as const;

type Overlay = (typeof overlays)[number];

const RaceMenuCard = ({
  line,
  back,
  covered,
  feed,
  onResume,
  onMute,
  onSettings,
  children,
}: {
  readonly line: string;
  readonly back: string;
  readonly covered: boolean;
  readonly feed: HudFeed;
  readonly onResume: () => void;
  readonly onMute: () => void;
  readonly onSettings: () => void;
  readonly children: ReactNode;
}) => {
  const hud = useSyncExternalStore(feed.subscribe, feed.read, () => idleHud);
  const backRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (
      !covered &&
      cardRef.current?.contains(document.activeElement) !== true
    ) {
      backRef.current?.focus({ preventScroll: true });
    }
  }, [covered]);
  return (
    <div
      ref={cardRef}
      className="bg-night/50 fixed inset-0 z-30 flex items-center justify-center"
      inert={covered}
    >
      <Card aria-label="Race menu" role="dialog">
        <PanelTitle>Race menu</PanelTitle>
        <PanelRule />
        <PanelLine>{line}</PanelLine>
        <SkewButton
          detail="Esc"
          onClick={onResume}
          ref={backRef}
          title={back}
          tone="primary"
        />
        <div className="flex gap-3.5">
          <SkewButton
            onClick={onMute}
            size="slim"
            title={hud.muted ? "Sound off" : "Sound on"}
          />
          <SkewButton onClick={onSettings} size="slim" title="Settings" />
        </div>
        {children}
        <PanelLine tone="quiet">{CONTROLS}, M to mute.</PanelLine>
      </Card>
    </div>
  );
};

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
  return (
    <>
      <RaceMenuCard
        back="Resume"
        covered={overlay !== "nothing"}
        feed={feed}
        line="The race is paused."
        onMute={onMute}
        onResume={onResume}
        onSettings={() => {
          setOverlay("settings");
        }}
      >
        {!racing && (
          <SkewButton
            detail="R restarts a single race."
            onClick={onRestart}
            title="Restart race"
          />
        )}
        <SkewButton
          detail={
            racing
              ? `Counts as a wreck, and a ${formatMoney(bill)} repair bill. Leaving or reloading the page counts as a wreck too.`
              : "Back to the bar."
          }
          onClick={() => {
            setOverlay("quit");
          }}
          title="Quit race"
        />
      </RaceMenuCard>
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
    </>
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
  return (
    <>
      <RaceMenuCard
        back="Back to the race"
        covered={settings}
        feed={feed}
        line="The race keeps going."
        onMute={onMute}
        onResume={onResume}
        onSettings={() => {
          setSettings(true);
        }}
      >
        <SkewButton
          detail="Back to the bar. Your bike rides on without you."
          onClick={onLeave}
          title="Leave race"
        />
      </RaceMenuCard>
      {settings && (
        <SettingsOverlay
          muted={hud.muted}
          onBack={() => {
            setSettings(false);
          }}
          onMute={onMute}
        />
      )}
    </>
  );
};
