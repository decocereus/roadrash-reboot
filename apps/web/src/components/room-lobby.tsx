import { launchRules } from "@racer/career/rules";
import { STARTING_BIKE } from "@racer/career/tables";
import { createInputLatency } from "@racer/rooms/input-latency";
import {
  cleanGuestName,
  isRequeuedRoom,
  nextRoomId,
} from "@racer/rooms/messages";
import { createRoomRun } from "@racer/rooms/room-run";
import { openRoomSeat } from "@racer/rooms/seat-client";
import type { RoomSeat } from "@racer/rooms/seat-client";
import { useEffect, useReducer, useRef, useState } from "react";

import { diagnostics } from "../diagnostics/hub.ts";
import type { RacePlan } from "../game/hud.ts";
import type { PrepareOutcome } from "../game/preparation.ts";
import { storedGuestName, storeGuestName } from "./guest-name.ts";
import { moveToRoom, roomArrivalOf, roomLink } from "./room-url.ts";
import { GuestNameScreen, RoomLobbyScreen } from "./screens/room-lobby.tsx";

const REDRAW_MS = 1000;
const REOPEN_MS = 2000;
const REQUEUED_START_MS = 8000;

const planOf = (seat: RoomSeat, roomId: string): RacePlan | null => {
  const race = seat.race();
  if (!race) {
    return null;
  }
  const latency = createInputLatency(
    () => performance.now(),
    (done) => {
      requestAnimationFrame(done);
    }
  );
  globalThis.addEventListener("keydown", (event) => {
    if (!event.repeat) {
      latency.pressed();
    }
  });
  globalThis.addEventListener("pagehide", seat.leave);
  const room = createRoomRun(seat, race, roomId, latency);
  Reflect.set(globalThis, "__rushlineRoom", {
    client: race.client,
    digestMatched: race.digestMatched,
    me: race.me,
    report: room.report,
    rttMs: seat.rttMs,
  });
  return {
    bikeId: STARTING_BIKE,
    mode: "quick",
    room,
    rules: launchRules,
    setup: race.setup,
  };
};

interface RoomProps {
  readonly roomId: string;
  readonly ready: boolean;
  readonly onBack: () => void;
  readonly onLost: () => void;
  readonly onPrepare: (plan: RacePlan) => Promise<PrepareOutcome>;
  readonly onStart: (plan: RacePlan) => void;
}

const SeatedLobby = ({
  name,
  onChangeName,
  roomId,
  ready,
  onBack,
  onLost,
  onPrepare,
  onStart,
}: RoomProps & {
  readonly name: string;
  readonly onChangeName: () => void;
}) => {
  const [copied, setCopied] = useState(false);
  const [seat, setSeat] = useState<RoomSeat | null>(null);
  const [, redraw] = useReducer((count: number) => count + 1, 0);
  const [opening, reopen] = useReducer((count: number) => count + 1, 0);
  const handedOver = useRef(false);
  const riding = useRef(false);
  const lostTold = useRef(false);
  const joinedTold = useRef(false);
  const [plan, setPlan] = useState<RacePlan | null>(null);
  const [prepared, setPrepared] = useState(false);
  useEffect(() => {
    let reopening: ReturnType<typeof setTimeout> | null = null;
    const opened = openRoomSeat(import.meta.env.VITE_ROOMS_URL, roomId, name);
    const tellLost = () => {
      if (!lostTold.current) {
        lostTold.current = true;
        diagnostics().events.track({
          event: "room_lost",
          stage: opened.race() ? "race" : "lobby",
        });
      }
    };
    opened.listen({
      onChange: () => {
        if (opened.phase() !== "lost") {
          redraw();
        } else if (opened.race()) {
          tellLost();
          onLost();
          moveToRoom(nextRoomId(roomId), "moved");
        } else {
          tellLost();
          reopening = setTimeout(reopen, REOPEN_MS);
        }
      },
    });
    setSeat(opened);
    return () => {
      if (reopening) {
        clearTimeout(reopening);
      }
      if (!riding.current) {
        opened.leave();
      }
    };
  }, [name, onLost, roomId, opening]);
  const copyLink = async (): Promise<void> => {
    await navigator.clipboard.writeText(roomLink(roomId));
    setCopied(true);
    diagnostics().events.track({ event: "invite_copied" });
  };
  const phase = seat?.phase() ?? "connecting";
  useEffect(() => {
    if (phase === "lobby" && !joinedTold.current) {
      joinedTold.current = true;
      diagnostics().events.track({
        event: "room_joined",
        via: roomArrivalOf(globalThis.location.search),
      });
    }
  }, [phase]);
  const racing = phase === "racing";
  const raceBegun = racing || phase === "loading";
  const requeued = isRequeuedRoom(roomId);
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
    if (!(seat && raceBegun && ready) || handedOver.current) {
      return;
    }
    const next = planOf(seat, roomId);
    if (!next) {
      return;
    }
    handedOver.current = true;
    setPlan(next);
    const prepare = async (): Promise<void> => {
      const outcome = await onPrepare(next);
      if (outcome.kind !== "cancelled") {
        seat.ready();
        setPrepared(true);
      }
    };
    void prepare();
  }, [seat, roomId, raceBegun, ready, onPrepare]);
  useEffect(() => {
    if (plan && prepared && racing) {
      riding.current = true;
      onStart(plan);
    }
  }, [plan, prepared, racing, onStart]);
  return (
    <RoomLobbyScreen
      copied={copied}
      name={name}
      onBack={onBack}
      onChangeName={onChangeName}
      onCopyLink={() => {
        void copyLink();
      }}
      onStart={() => {
        seat?.start();
      }}
      phase={phase}
      roomId={roomId}
      refusal={seat?.refusal() ?? null}
      requeued={requeued}
      riderNames={seat?.riderNames() ?? []}
      riders={seat?.riders() ?? 0}
      startsInSeconds={Math.max(0, Math.ceil((seat?.startsInMs() ?? 0) / 1000))}
    />
  );
};

export const RoomLobby = (props: RoomProps) => {
  const [name, setName] = useState(storedGuestName);
  if (name === null) {
    return (
      <GuestNameScreen
        onBack={props.onBack}
        onName={(typed) => {
          const clean = cleanGuestName(typed);
          storeGuestName(clean);
          setName(clean);
        }}
      />
    );
  }
  return (
    <SeatedLobby
      {...props}
      name={name}
      onChangeName={() => {
        setName(null);
      }}
    />
  );
};
