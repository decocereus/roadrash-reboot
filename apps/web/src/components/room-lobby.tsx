import { launchRules } from "@racer/career/rules";
import { STARTING_BIKE } from "@racer/career/tables";
import { createRoomRun } from "@racer/rooms/room-run";
import { openRoomSeat } from "@racer/rooms/seat-client";
import type { RoomSeat } from "@racer/rooms/seat-client";
import { useEffect, useReducer, useRef, useState } from "react";

import type { RacePlan } from "../game/hud.ts";
import type { PrepareOutcome } from "../game/preparation.ts";
import { RoomLobbyScreen } from "./screens/room-lobby.tsx";

const planOf = (seat: RoomSeat): RacePlan | null => {
  const race = seat.race();
  if (!race) {
    return null;
  }
  Reflect.set(globalThis, "__rushlineRoom", {
    client: race.client,
    digestMatched: race.digestMatched,
    me: race.me,
    rttMs: seat.rttMs,
  });
  return {
    bikeId: STARTING_BIKE,
    mode: "quick",
    room: createRoomRun(seat, race),
    rules: launchRules,
    setup: race.setup,
  };
};

export const RoomLobby = ({
  raceId,
  ready,
  onBack,
  onPrepare,
  onStart,
}: {
  readonly raceId: string;
  readonly ready: boolean;
  readonly onBack: () => void;
  readonly onPrepare: (plan: RacePlan) => Promise<PrepareOutcome>;
  readonly onStart: (plan: RacePlan) => void;
}) => {
  const [seat, setSeat] = useState<RoomSeat | null>(null);
  const [, redraw] = useReducer((count: number) => count + 1, 0);
  const handedOver = useRef(false);
  useEffect(() => {
    const opened = openRoomSeat(import.meta.env.VITE_ROOMS_URL, raceId);
    opened.listen({ onChange: redraw });
    setSeat(opened);
    return () => {
      if (!handedOver.current) {
        opened.leave();
      }
    };
  }, [raceId]);
  const racing = seat?.phase() === "racing";
  useEffect(() => {
    if (!(seat && racing && ready) || handedOver.current) {
      return;
    }
    const plan = planOf(seat);
    if (!plan) {
      return;
    }
    handedOver.current = true;
    const prepare = async (): Promise<void> => {
      const outcome = await onPrepare(plan);
      if (outcome.kind !== "cancelled") {
        onStart(plan);
      }
    };
    void prepare();
  }, [seat, racing, ready, onPrepare, onStart]);
  return (
    <RoomLobbyScreen
      onBack={onBack}
      onStart={() => {
        seat?.start();
      }}
      phase={seat?.phase() ?? "connecting"}
      raceId={raceId}
      refusal={seat?.refusal() ?? null}
      seats={seat?.seats() ?? 0}
    />
  );
};
