import { launchRules } from "@racer/career/rules";
import { STARTING_BIKE } from "@racer/career/tables";
import { createInputLatency } from "@racer/rooms/input-latency";
import { cleanGuestName } from "@racer/rooms/messages";
import type { RoomPreview } from "@racer/rooms/messages";
import { enterQueue } from "@racer/rooms/queue-client";
import { createRoomRun } from "@racer/rooms/room-run";
import { openRoomSeat } from "@racer/rooms/seat-client";
import type { RoomSeat } from "@racer/rooms/seat-client";
import { useEffect, useEffectEvent, useReducer, useRef, useState } from "react";

import { diagnostics } from "../diagnostics/hub.ts";
import { graphicsCard } from "../diagnostics/player-events.ts";
import type { RacePlan } from "../game/hud.ts";
import type { PrepareOutcome } from "../prepare-outcome.ts";
import { BarLobby } from "./bar-lobby.tsx";
import { memberKey, storedGuestName, storeGuestName } from "./guest-name.ts";
import { readRoomPreview } from "./room-preview.ts";
import { moveToRoom, roomArrivalOf, roomLink } from "./room-url.ts";
import {
  GuestNameScreen,
  QueueScreen,
  RoomInviteScreen,
  RoomLobbyScreen,
} from "./screens/room-lobby.tsx";

const DOOR_MOMENT_MS = 5000;
const REDRAW_MS = 1000;
const REOPEN_MS = 2000;

const secondsOf = (ms: number | null): number | null =>
  ms === null ? null : Math.max(0, Math.ceil(ms / 1000));

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
  readonly onDoorMoment: (atDoor: boolean) => void;
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
  onDoorMoment,
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
  const lost = useEffectEvent(onLost);
  useEffect(() => {
    let reopening: ReturnType<typeof setTimeout> | null = null;
    const card = graphicsCard();
    const opened = openRoomSeat(
      import.meta.env.VITE_ROOMS_URL,
      roomId,
      name,
      __RUSHLINE_BUILD__.rooms,
      memberKey(),
      () =>
        diagnostics().settings.read().raceData
          ? {
              build: __RUSHLINE_BUILD__.sha,
              gpu: card,
              graphics: `quality rung ${diagnostics().qualityRung()}`,
            }
          : null
    );
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
          lost();
          moveToRoom(roomId, "moved");
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
  }, [name, roomId, opening]);
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
  useEffect(() => {
    onDoorMoment(raceBegun);
    return () => {
      onDoorMoment(false);
    };
  }, [raceBegun, onDoorMoment]);
  useEffect(() => {
    const redrawing = setInterval(redraw, REDRAW_MS);
    return () => {
      clearInterval(redrawing);
    };
  }, []);
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
    const begunAt = performance.now();
    const prepare = async (): Promise<void> => {
      const outcome = await onPrepare(next);
      if (outcome.kind !== "cancelled") {
        setTimeout(
          () => {
            seat.loaded();
            setPrepared(true);
          },
          Math.max(0, DOOR_MOMENT_MS - (performance.now() - begunAt))
        );
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
  const lobby = seat?.lobby() ?? null;
  if (seat && lobby && ((raceBegun && ready) || phase === "lobby")) {
    return (
      <BarLobby
        copied={copied}
        lobby={lobby}
        name={name}
        onBack={onBack}
        onChangeName={onChangeName}
        onCopyLink={() => {
          void copyLink();
        }}
        roomId={roomId}
        seat={seat}
        startsInSeconds={secondsOf(seat.startsInMs())}
      />
    );
  }
  return (
    <RoomLobbyScreen
      name={name}
      onBack={onBack}
      phase={phase}
      refusal={seat?.refusal() ?? null}
      roomId={roomId}
    />
  );
};

export const RoomLobby = (props: RoomProps) => {
  const [name, setName] = useState(storedGuestName);
  const [invited, setInvited] = useState(
    () => roomArrivalOf(globalThis.location.search) === "link"
  );
  const [preview, setPreview] = useState<RoomPreview | null>(null);
  useEffect(
    () =>
      invited
        ? readRoomPreview(
            import.meta.env.VITE_ROOMS_URL,
            props.roomId,
            setPreview
          )
        : undefined,
    [invited, props.roomId]
  );
  if (invited) {
    return (
      <RoomInviteScreen
        onBack={props.onBack}
        onJoin={() => {
          setInvited(false);
        }}
        preview={preview}
        roomId={props.roomId}
      />
    );
  }
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

const FindingRiders = ({ onBack }: { readonly onBack: () => void }) => {
  const [riders, setRiders] = useState(1);
  const [refused, setRefused] = useState(false);
  const [opening, reopen] = useReducer((count: number) => count + 1, 0);
  useEffect(() => {
    let reopening: ReturnType<typeof setTimeout> | null = null;
    const leave = enterQueue(
      import.meta.env.VITE_ROOMS_URL,
      __RUSHLINE_BUILD__.rooms,
      {
        onLost: () => {
          reopening = setTimeout(reopen, REOPEN_MS);
        },
        onMessage: (message) => {
          switch (message.kind) {
            case "waiting": {
              setRiders(message.riders);
              break;
            }
            case "placed": {
              moveToRoom(message.roomId, "queue");
              break;
            }
            case "refused": {
              setRefused(true);
              break;
            }
            default: {
              message satisfies never;
            }
          }
        },
      }
    );
    return () => {
      if (reopening) {
        clearTimeout(reopening);
      }
      leave();
    };
  }, [opening]);
  return <QueueScreen onBack={onBack} refused={refused} riders={riders} />;
};

export const QuickRace = ({ onBack }: { readonly onBack: () => void }) => {
  const [name, setName] = useState(storedGuestName);
  if (name === null) {
    return (
      <GuestNameScreen
        onBack={onBack}
        onName={(typed) => {
          const clean = cleanGuestName(typed);
          storeGuestName(clean);
          setName(clean);
        }}
      />
    );
  }
  return <FindingRiders onBack={onBack} />;
};
