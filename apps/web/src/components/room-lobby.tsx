import { launchRules } from "@racer/career/rules";
import { STARTING_BIKE } from "@racer/career/tables";
import { createInputLatency } from "@racer/rooms/input-latency";
import { cleanGuestName } from "@racer/rooms/messages";
import type { RoomPreview } from "@racer/rooms/messages";
import { enterQueue } from "@racer/rooms/queue-client";
import type { QueueRefusal } from "@racer/rooms/queue-messages";
import { launchRoomConfig, msOf } from "@racer/rooms/room-config";
import { createRoomRun } from "@racer/rooms/room-run";
import { openRoomSeat } from "@racer/rooms/seat-client";
import type { RoomSeat, SeatRace } from "@racer/rooms/seat-client";
import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import type { RefObject } from "react";

import { diagnostics } from "../diagnostics/hub.ts";
import { graphicsCard } from "../diagnostics/player-events.ts";
import type { RacePlan } from "../game/hud.ts";
import type { RoomVisit } from "../navigation.ts";
import { preparedRace } from "../prepare-outcome.ts";
import type { PrepareOutcome } from "../prepare-outcome.ts";
import { seatChange, seatClosing, stepRoom } from "../room-handoff.ts";
import type { RoomHandoff } from "../room-handoff.ts";
import { BarLobby } from "./bar-lobby.tsx";
import {
  memberKey,
  racedIn,
  rememberRaceRoom,
  storedGuestName,
  storeGuestName,
} from "./guest-name.ts";
import { NO_HOLD, readRoomPreview } from "./room-preview.ts";
import { roomLink } from "./room-url.ts";
import { GettingBackOn, TooLate } from "./screens/rejoin.tsx";
import {
  GuestNameScreen,
  QueueScreen,
  RoomFailedScreen,
  RoomInviteScreen,
  RoomLobbyScreen,
} from "./screens/room-lobby.tsx";
import { useHandoff } from "./use-handoff.ts";

const DOOR_MOMENT_MS = 5000;
const REDRAW_MS = 1000;
const REOPEN_MS = 2000;

interface SeatRide {
  readonly plan: RacePlan;
  readonly seat: RoomSeat;
}

const inTheLobby = (): RoomHandoff<SeatRide> => ({ kind: "lobby" });

const afterDoorMoment = (ms: number, elapsed: () => void): (() => void) => {
  const door = setTimeout(elapsed, ms);
  return () => {
    clearTimeout(door);
  };
};

const doorWaitOf = (race: SeatRace | null): number =>
  race !== null && race.awayMs !== null ? 0 : DOOR_MOMENT_MS;

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
  rememberRaceRoom(roomId);
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
  readonly visit: RoomVisit;
  readonly ready: boolean;
  readonly failure: string;
  readonly onBack: () => void;
  readonly onMove: (visit: RoomVisit) => void;
  readonly onDoorMoment: (atDoor: boolean) => void;
  readonly onLost: () => void;
  readonly onPrepare: (plan: RacePlan) => Promise<PrepareOutcome>;
  readonly onStart: (plan: RacePlan) => void;
}

interface BootFailed {
  readonly bootFailed: RefObject<boolean>;
}

const SeatedLobby = ({
  bootFailed,
  name,
  onChangeName,
  visit,
  ready,
  onBack,
  onDoorMoment,
  onLost,
  onMove,
  onPrepare,
  onStart,
}: RoomProps &
  BootFailed & {
    readonly name: string;
    readonly onChangeName: () => void;
  }) => {
  const [copied, setCopied] = useState(false);
  const [seat, setSeat] = useState<RoomSeat | null>(null);
  const [, redraw] = useReducer((count: number) => count + 1, 0);
  const [opening, reopen] = useReducer((count: number) => count + 1, 0);
  const { arrival, rejoin, roomId } = visit;
  const lostTold = useRef(false);
  const gaveUp = useRef(rejoin === "no");
  const joinedTold = useRef(false);
  const lost = useEffectEvent(onLost);
  const moveIn = useEffectEvent((next: RoomVisit["rejoin"]) => {
    onMove({ arrival: "moved", rejoin: next, roomId });
  });
  const {
    now: handoffNow,
    send,
    state: handoff,
  } = useHandoff(stepRoom<SeatRide>, inTheLobby, (effect) => {
    const { plan, seat: ridden } = effect.ride;
    switch (effect.kind) {
      case "leave": {
        ridden.leave();
        moveIn(null);
        break;
      }
      case "prepare": {
        const prepare = async (): Promise<void> => {
          send({ kind: preparedRace(await onPrepare(plan)) });
        };
        void prepare();
        break;
      }
      case "reportLoaded": {
        ridden.loaded();
        break;
      }
      case "start": {
        onStart(plan);
        break;
      }
      default: {
        effect.kind satisfies never;
      }
    }
  });
  useEffect(() => {
    let reopening: ReturnType<typeof setTimeout> | null = null;
    const card = graphicsCard();
    const opened = openRoomSeat(
      import.meta.env.VITE_ROOMS_URL,
      roomId,
      name,
      import.meta.env.VITE_ROOMS_BUILD,
      memberKey(),
      {
        ...diagnostics().settings.raceData,
        browser: () => ({
          build: __RUSHLINE_BUILD__.sha,
          gpu: card,
          graphics: `quality rung ${diagnostics().qualityRung()}`,
        }),
      },
      !gaveUp.current
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
        const race = opened.race();
        const change = seatChange(
          opened.phase(),
          opened.refusal(),
          race !== null,
          handoffNow()
        );
        switch (change) {
          case "backToLobby": {
            moveIn(null);
            break;
          }
          case "raceLost": {
            tellLost();
            lost();
            break;
          }
          case "redraw": {
            redraw();
            break;
          }
          case "reopen": {
            tellLost();
            reopening = setTimeout(reopen, REOPEN_MS);
            break;
          }
          case "seatFlooded": {
            moveIn("flooded");
            break;
          }
          case "seatTaken": {
            moveIn("taken");
            break;
          }
          case "tryRejoin": {
            tellLost();
            lost();
            moveIn("try");
            break;
          }
          default: {
            change satisfies never;
          }
        }
      },
      onOpen: () => {
        gaveUp.current = false;
      },
    });
    setSeat(opened);
    return () => {
      if (reopening) {
        clearTimeout(reopening);
      }
      const closing = seatClosing(handoffNow(), bootFailed.current);
      switch (closing) {
        case "keep": {
          break;
        }
        case "leave": {
          opened.leave();
          break;
        }
        case "leaveRoom": {
          opened.leaveRoom();
          break;
        }
        default: {
          closing satisfies never;
        }
      }
    };
  }, [bootFailed, handoffNow, name, roomId, opening]);
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
        via: arrival,
      });
    }
  }, [arrival, phase]);
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
  const doorMoment = seat !== null && raceBegun && ready;
  const race = seat?.race() ?? null;
  const doorMs = doorWaitOf(race);
  useEffect(
    () =>
      doorMoment
        ? afterDoorMoment(doorMs, () => {
            send({ kind: "doorElapsed" });
          })
        : undefined,
    [doorMoment, doorMs, send]
  );
  const inLobby = handoff.kind === "lobby";
  useEffect(() => {
    if (!(seat && doorMoment && inLobby)) {
      return;
    }
    const plan = planOf(seat, roomId);
    if (plan) {
      send({ kind: "raceBegun", ride: { plan, seat } });
    }
  }, [doorMoment, inLobby, roomId, seat, send]);
  useEffect(() => {
    if (racing) {
      send({ kind: "roomRacing" });
    }
  }, [handoff, racing, send]);
  const lobby = seat?.lobby() ?? null;
  const leaveRoom = (): void => {
    seat?.leaveRoom();
    onBack();
  };
  if (race && race.awayMs !== null) {
    return (
      <GettingBackOn awayMs={race.awayMs} holdSeconds={race.holdSeconds} />
    );
  }
  if (seat && lobby && ((raceBegun && ready) || phase === "lobby")) {
    return (
      <>
        {rejoin === "try" && (
          <TooLate
            holdSeconds={lobby.seatHoldSeconds}
            lostRace={lobby.lostRace}
          />
        )}
        <BarLobby
          copied={copied}
          lobby={lobby}
          name={name}
          onBack={leaveRoom}
          onChangeName={onChangeName}
          onCopyLink={() => {
            void copyLink();
          }}
          roomId={roomId}
          seat={seat}
          startsInSeconds={secondsOf(seat.startsInMs())}
        />
      </>
    );
  }
  return (
    <RoomLobbyScreen
      name={name}
      onBack={leaveRoom}
      phase={phase}
      refusal={seat?.refusal() ?? null}
      roomId={roomId}
    />
  );
};

const RoomEntry = (props: RoomProps & BootFailed) => {
  const { arrival, rejoin, roomId } = props.visit;
  const [name, setName] = useState(storedGuestName);
  const [invited, setInvited] = useState(
    () => arrival === "link" && !racedIn(roomId)
  );
  const [preview, setPreview] = useState<RoomPreview | null>(null);
  useEffect(
    () =>
      invited
        ? readRoomPreview(
            import.meta.env.VITE_ROOMS_URL,
            roomId,
            NO_HOLD,
            setPreview
          )
        : undefined,
    [invited, roomId]
  );
  if (invited) {
    return (
      <RoomInviteScreen
        onBack={props.onBack}
        onJoin={() => {
          setInvited(false);
        }}
        preview={preview}
        roomId={roomId}
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
  if (rejoin === "taken" || rejoin === "flooded") {
    return (
      <RoomLobbyScreen
        name={name}
        onBack={props.onBack}
        phase="refused"
        refusal={rejoin === "taken" ? "replaced" : "flooded"}
        roomId={roomId}
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

export const RoomLobby = (props: RoomProps) => {
  const bootFailed = useRef(false);
  useLayoutEffect(() => {
    bootFailed.current = props.failure !== "";
  }, [props.failure]);
  return props.failure === "" ? (
    <RoomEntry {...props} bootFailed={bootFailed} />
  ) : (
    <RoomFailedScreen
      failure={props.failure}
      onBack={props.onBack}
      roomId={props.visit.roomId}
    />
  );
};

interface QueueProps {
  readonly onBack: () => void;
  readonly onPlaced: (roomId: string) => void;
}

const FindingRiders = ({ onBack, onPlaced }: QueueProps) => {
  const placed = useEffectEvent(onPlaced);
  const [riders, setRiders] = useState(1);
  const [refusal, setRefusal] = useState<QueueRefusal | null>(null);
  const [opening, reopen] = useReducer((count: number) => count + 1, 0);
  useEffect(() => {
    let reopening: ReturnType<typeof setTimeout> | null = null;
    const leave = enterQueue(
      import.meta.env.VITE_ROOMS_URL,
      import.meta.env.VITE_ROOMS_BUILD,
      memberKey(),
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
              placed(message.roomId);
              break;
            }
            case "refused": {
              setRefusal(message.reason);
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
  return (
    <QueueScreen
      onBack={onBack}
      refusal={refusal}
      riders={riders}
      waitSeconds={launchRoomConfig.queueWaitSeconds}
    />
  );
};

export const QuickRace = ({ onBack, onPlaced }: QueueProps) => {
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
  return <FindingRiders onBack={onBack} onPlaced={onPlaced} />;
};

export const RejoinWatch = ({
  holdSeconds,
  onOpen,
  roomId,
}: {
  readonly holdSeconds: number;
  readonly onOpen: () => void;
  readonly roomId: string;
}) => {
  const opened = useEffectEvent(onOpen);
  useEffect(
    () =>
      readRoomPreview(
        import.meta.env.VITE_ROOMS_URL,
        roomId,
        msOf(holdSeconds),
        () => {
          opened();
        }
      ),
    [holdSeconds, roomId]
  );
  return null;
};
