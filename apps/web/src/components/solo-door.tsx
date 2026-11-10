import type { RaceRules } from "@racer/career/rules";
import type { CareerState } from "@racer/career/state";
import { Panel, PanelLine, PanelTitle } from "@racer/ui/components/kit-panel";
import {
  SkewButton,
  TextButton,
  TextLinks,
} from "@racer/ui/components/skew-button";
import { useEffect } from "react";

import { planFor } from "../career/flow.ts";
import type { RaceEntry } from "../career/flow.ts";
import type { RacePlan } from "../game/hud.ts";
import { preparedRace } from "../prepare-outcome.ts";
import type { PrepareOutcome } from "../prepare-outcome.ts";
import { stepSoloDoor } from "../race-handoff.ts";
import type { SoloDoorHandoff } from "../race-handoff.ts";
import { useHandoff } from "./use-handoff.ts";

const DOOR_MOMENT_MS = 5000;

export const SoloDoor = ({
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
    stepSoloDoor<RacePlan>,
    (): SoloDoorHandoff<RacePlan> => ({
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
    const door = setTimeout(() => {
      send({ kind: "doorElapsed" });
    }, DOOR_MOMENT_MS);
    return () => {
      clearTimeout(door);
    };
  }, [send]);
  useEffect(() => {
    if (ready) {
      send({ kind: "gameReady" });
    }
  }, [ready, send]);
  const loadFailed =
    handoff.kind === "failed" || handoff.kind === "failedPastDoor";
  if (!loadFailed && failure === "") {
    return null;
  }
  return (
    <Panel aria-label="No ride">
      <PanelTitle>No ride</PanelTitle>
      <PanelLine role="alert" tone="warn">
        {loadFailed
          ? "The riders did not load. Check your connection and try again."
          : `Could not start the game: ${failure}`}
      </PanelLine>
      {loadFailed && (
        <SkewButton
          onClick={() => {
            send({ kind: "retry" });
          }}
          title="Retry"
          tone="primary"
        />
      )}
      <TextLinks>
        <TextButton
          onClick={() => {
            send({ kind: "closed" });
            onBack();
          }}
        >
          Back
        </TextButton>
      </TextLinks>
    </Panel>
  );
};
