import { launchRules } from "@racer/career/rules";
import { STARTING_BIKE } from "@racer/career/tables";
import { isRequeuedRoom, nextRoomId } from "@racer/rooms/messages";
import { createRoomRun } from "@racer/rooms/room-run";
import { openRoomSeat } from "@racer/rooms/seat-client";
import type { RoomSeat } from "@racer/rooms/seat-client";
import { useEffect, useReducer, useRef, useState } from "react";

import type { RacePlan } from "../game/hud.ts";
import type { PrepareOutcome } from "../game/preparation.ts";
import { RoomLobbyScreen } from "./screens/room-lobby.tsx";

const REDRAW_MS = 1000;
const REOPEN_MS = 2000;
const REQUEUED_START_MS = 8000;

const moveToRoom = (raceId: string): void => {
  const search = new URLSearchParams(globalThis.location.search);
  search.set("room", raceId);
  globalThis.location.assign(`/?${search.toString()}`);
};

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
  const [opening, reopen] = useReducer((count: number) => count + 1, 0);
  const handedOver = useRef(false);
  useEffect(() => {
    let reopening: ReturnType<typeof setTimeout> | null = null;
    const opened = openRoomSeat(import.meta.env.VITE_ROOMS_URL, raceId);
    opened.listen({
      onChange: () => {
        if (opened.phase() !== "lost") {
          redraw();
        } else if (opened.race()) {
          moveToRoom(nextRoomId(raceId));
        } else {
          reopening = setTimeout(reopen, REOPEN_MS);
        }
      },
    });
    setSeat(opened);
    return () => {
      if (reopening) {
        clearTimeout(reopening);
      }
      if (!handedOver.current) {
        opened.leave();
      }
    };
  }, [raceId, opening]);
  const phase = seat?.phase() ?? "connecting";
  const racing = phase === "racing";
  const requeued = isRequeuedRoom(raceId);
  useEffect(() => {
    const redrawing = setInterval(redraw, REDRAW_MS);
    return () => {
      clearInterval(redrawing);
    };
  }, []);
  useEffect(() => {
    const starting = setTimeout(() => {
      if (requeued && seat?.phase() === "lobby") {
        seat.start();
      }
    }, REQUEUED_START_MS);
    return () => {
      clearTimeout(starting);
    };
  }, [phase, requeued, seat]);
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
      phase={phase}
      raceId={raceId}
      refusal={seat?.refusal() ?? null}
      requeued={requeued}
      riders={seat?.riders() ?? 0}
      startsInSeconds={Math.max(0, Math.ceil((seat?.startsInMs() ?? 0) / 1000))}
    />
  );
};
