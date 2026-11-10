import { launchRules } from "@racer/career/rules";
import { STARTING_BIKE } from "@racer/career/tables";
import { createInputLatency } from "@racer/rooms/input-latency";
import type { RoomPreview } from "@racer/rooms/messages";
import { enterQueue } from "@racer/rooms/queue-client";
import type { QueueRefusal } from "@racer/rooms/queue-messages";
import { launchRoomConfig, msOf } from "@racer/rooms/room-config";
import { roomKindOf } from "@racer/rooms/room-id";
import { createRoomRun } from "@racer/rooms/room-run";
import { openRoomSeat } from "@racer/rooms/seat-client";
import type { RoomSeat, SeatRace } from "@racer/rooms/seat-client";
import { Panel, PanelRule, PanelTitle } from "@racer/ui/components/kit-panel";
import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode, RefObject } from "react";

import { diagnostics } from "../diagnostics/hub.ts";
import { graphicsCard } from "../diagnostics/player-events.ts";
import type { RacePlan } from "../game/hud.ts";
import type { RoomVisit } from "../navigation.ts";
import { preparedRace } from "../prepare-outcome.ts";
import type { PrepareOutcome } from "../prepare-outcome.ts";
import { seatChange, seatClosing, stepRoom } from "../room-handoff.ts";
import type { RoomEvent, RoomHandoff } from "../room-handoff.ts";
import { LobbyPart } from "./bar-lobby.tsx";
import {
  memberKey,
  rememberRoom,
  storedGuestName,
  watchGuestName,
} from "./guest-name.ts";
import { NO_HOLD, readRoomPreview } from "./room-preview.ts";
import { roomLink } from "./room-url.ts";
import { NameCard } from "./screens/name-card.tsx";
import { GettingBackOn, TooLate } from "./screens/rejoin.tsx";
import {
  FindingPart,
  InvitePart,
  RoomFailedPart,
  RoomStatusPart,
} from "./screens/room-lobby.tsx";
import { useHandoff } from "./use-handoff.ts";

const DOOR_MOMENT_MS = 5000;

const useGuestName = (): string | null =>
  useSyncExternalStore(watchGuestName, storedGuestName, () => null);

const PanelPart = ({
  shown,
  label,
  children,
}: {
  readonly shown: boolean;
  readonly label: string;
  readonly children: ReactNode;
}) => (
  <Panel aria-label={label} hidden={!shown}>
    {children}
  </Panel>
);

const lobbyName = (roomId: string): string =>
  roomKindOf(roomId) === "public" ? "Public lobby" : roomId;

const RoomStatusPanel = ({
  shown,
  roomId,
  children,
}: {
  readonly shown: boolean;
  readonly roomId: string;
  readonly children: ReactNode;
}) => (
  <PanelPart label="This lobby" shown={shown}>
    <PanelTitle face="stencil">{lobbyName(roomId)}</PanelTitle>
    <PanelRule />
    {children}
  </PanelPart>
);
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
  rememberRoom(roomId);
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
  readonly shown: boolean;
  readonly onSeat: (seat: RoomSeat | null) => void;
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

const useDoorMoment = ({
  open,
  inLobby,
  roomId,
  seat,
  send,
}: {
  readonly open: boolean;
  readonly inLobby: boolean;
  readonly roomId: string;
  readonly seat: RoomSeat | null;
  readonly send: (event: RoomEvent<SeatRide>) => void;
}): void => {
  const doorMoment = seat !== null && open;
  const doorMs = doorWaitOf(seat?.race() ?? null);
  useEffect(
    () =>
      doorMoment
        ? afterDoorMoment(doorMs, () => {
            send({ kind: "doorElapsed" });
          })
        : undefined,
    [doorMoment, doorMs, send]
  );
  useEffect(() => {
    if (!(seat && doorMoment && inLobby)) {
      return;
    }
    const plan = planOf(seat, roomId);
    if (plan) {
      send({ kind: "raceBegun", ride: { plan, seat } });
    }
  }, [doorMoment, inLobby, roomId, seat, send]);
};

const SeatedLobby = ({
  bootFailed,
  name,
  visit,
  ready,
  shown,
  onBack,
  onDoorMoment,
  onLost,
  onMove,
  onPrepare,
  onSeat,
  onStart,
}: RoomProps &
  BootFailed & {
    readonly name: string;
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
  const seated = useEffectEvent(onSeat);
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
    seated(opened);
    return () => {
      seated(null);
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
  useDoorMoment({
    inLobby: handoff.kind === "lobby",
    open: raceBegun && ready,
    roomId,
    seat,
    send,
  });
  const race = seat?.race() ?? null;
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
        {!seat.race() && (
          <PanelPart label="This lobby" shown={shown}>
            <LobbyPart
              copied={copied}
              lobby={lobby}
              onCopyLink={() => {
                void copyLink();
              }}
              onLeave={leaveRoom}
              roomId={roomId}
              seat={seat}
              shown={shown}
              startsInSeconds={secondsOf(seat.startsInMs())}
            />
          </PanelPart>
        )}
      </>
    );
  }
  return (
    <RoomStatusPanel roomId={roomId} shown={shown}>
      <RoomStatusPart
        onLeave={leaveRoom}
        phase={phase}
        refusal={seat?.refusal() ?? null}
      />
    </RoomStatusPanel>
  );
};

const RoomEntry = (props: RoomProps & BootFailed) => {
  const { rejoin, roomId } = props.visit;
  const name = useGuestName();
  if (name === null) {
    return (
      <>
        <RoomStatusPanel roomId={roomId} shown={props.shown}>
          <RoomStatusPart
            onLeave={props.onBack}
            phase="connecting"
            refusal={null}
          />
        </RoomStatusPanel>
        <NameCard onCancel={props.onBack} start={null} />
      </>
    );
  }
  if (rejoin === "taken" || rejoin === "flooded") {
    return (
      <RoomStatusPanel roomId={roomId} shown={props.shown}>
        <RoomStatusPart
          onLeave={props.onBack}
          phase="refused"
          refusal={rejoin === "taken" ? "replaced" : "flooded"}
        />
      </RoomStatusPanel>
    );
  }
  return <SeatedLobby {...props} name={name} />;
};

export const RoomLobby = (props: RoomProps) => {
  const bootFailed = useRef(false);
  useLayoutEffect(() => {
    bootFailed.current = props.failure !== "";
  }, [props.failure]);
  return props.failure === "" ? (
    <RoomEntry {...props} bootFailed={bootFailed} />
  ) : (
    <RoomStatusPanel roomId={props.visit.roomId} shown={props.shown}>
      <RoomFailedPart failure={props.failure} onLeave={props.onBack} />
    </RoomStatusPanel>
  );
};

export const RoomInvite = ({
  roomId,
  shown,
  onJoin,
  onNotNow,
}: {
  readonly roomId: string;
  readonly shown: boolean;
  readonly onJoin: () => void;
  readonly onNotNow: () => void;
}) => {
  const [preview, setPreview] = useState<RoomPreview | null>(null);
  useEffect(
    () =>
      readRoomPreview(
        import.meta.env.VITE_ROOMS_URL,
        roomId,
        NO_HOLD,
        setPreview
      ),
    [roomId]
  );
  return (
    <PanelPart label="Invite" shown={shown}>
      <InvitePart
        onJoin={onJoin}
        onNotNow={onNotNow}
        preview={preview}
        roomId={roomId}
      />
    </PanelPart>
  );
};

interface QueueProps {
  readonly shown: boolean;
  readonly onBack: () => void;
  readonly onPlaced: (roomId: string) => void;
}

const FindingRiders = ({ shown, onBack, onPlaced }: QueueProps) => {
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
    <PanelPart label="Finding riders" shown={shown}>
      <FindingPart
        onCancel={onBack}
        refusal={refusal}
        riders={riders}
        waitSeconds={launchRoomConfig.queueWaitSeconds}
      />
    </PanelPart>
  );
};

export const QuickRace = (props: QueueProps) => {
  const name = useGuestName();
  if (name === null) {
    return (
      <>
        <PanelPart label="Finding riders" shown={props.shown}>
          <FindingPart
            onCancel={props.onBack}
            refusal={null}
            riders={0}
            waitSeconds={launchRoomConfig.queueWaitSeconds}
          />
        </PanelPart>
        <NameCard onCancel={props.onBack} start={null} />
      </>
    );
  }
  return <FindingRiders {...props} />;
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
