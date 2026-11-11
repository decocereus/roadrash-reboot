import type { RoomRun } from "@racer/rooms/room-run";
import {
  Card,
  PanelLine,
  PanelRule,
  PanelTitle,
} from "@racer/ui/components/kit-panel";
import { SkewButton } from "@racer/ui/components/skew-button";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

import { ordinal } from "../../career/format.ts";
import { idleHud } from "../../hud-feed.ts";
import type { HudFeed } from "../../hud-feed.ts";
import type { RaceStage } from "../../navigation.ts";

const TICK_MS = 250;
const BIKE_UP_MS = 3000;
const SECONDS_PER_MINUTE = 60;

const clockOf = (leftMs: number): string => {
  const seconds = Math.ceil(Math.max(0, leftMs) / 1000);
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  return `${minutes}:${String(seconds % SECONDS_PER_MINUTE).padStart(2, "0")}`;
};

const useNow = (): number => {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const ticking = setInterval(() => {
      setNow(performance.now());
    }, TICK_MS);
    return () => {
      clearInterval(ticking);
    };
  }, []);
  return now;
};

const HoldTimer = ({
  holdMs,
  leftMs,
}: {
  readonly holdMs: number;
  readonly leftMs: number;
}) => (
  <div className="flex flex-col gap-2">
    <div className="font-display tracking-display flex justify-between text-xl font-bold uppercase">
      <span>Get back in</span>
      <span className="text-neon-yellow numeric">{clockOf(leftMs)}</span>
    </div>
    <div className="bg-paper/20 h-1.5">
      <div
        className="bg-neon-yellow h-full"
        style={{ width: `${Math.max(0, leftMs / holdMs) * 100}%` }}
      />
    </div>
  </div>
);

const RoomCard = ({
  children,
  label,
  late = false,
  title,
}: {
  readonly children: ReactNode;
  readonly label: string;
  readonly late?: boolean;
  readonly title: string;
}) => (
  <Card className={late ? "border-neon-red" : undefined} role="alert">
    <p
      className={`text-lg font-bold ${late ? "text-neon-red" : "text-neon-yellow"}`}
    >
      {label}
    </p>
    <PanelTitle className="text-paper whitespace-normal">{title}</PanelTitle>
    <PanelRule />
    {children}
  </Card>
);

const BarButton = ({
  onClick,
  strong = false,
}: {
  readonly onClick: () => void;
  readonly strong?: boolean;
}) => (
  <SkewButton
    autoFocus
    onClick={onClick}
    size="slim"
    title="Back to the bar"
    tone={strong ? "primary" : "plain"}
  />
);

const Backdrop = ({ children }: { readonly children: ReactNode }) => (
  <div className="bg-night/65 fixed inset-0 z-40 flex items-center justify-center backdrop-grayscale">
    {children}
  </div>
);

const LateCard = ({
  holdSeconds,
  onBack,
}: {
  readonly holdSeconds: number;
  readonly onBack: () => void;
}) => (
  <Backdrop>
    <RoomCard label="Too late" late title="We kept your bike">
      <PanelLine tone="quiet">
        You were gone more than{" "}
        <span className="text-paper">{holdSeconds} seconds</span>. We&apos;ll
        ride it home. Catch the next one at the bar.
      </PanelLine>
      <BarButton onClick={onBack} strong />
    </RoomCard>
  </Backdrop>
);

const LostCard = ({ onBack }: { readonly onBack: () => void }) => (
  <Backdrop>
    <RoomCard label="Room restarted" late title="That race is gone">
      <PanelLine tone="quiet">
        The room restarted and lost the race. No result counts. Ready up and the
        next one starts from the line.
      </PanelLine>
      <BarButton onClick={onBack} strong />
    </RoomCard>
  </Backdrop>
);

export const TooLate = ({
  holdSeconds,
  lostRace,
}: {
  readonly holdSeconds: number;
  readonly lostRace: string | null;
}) => {
  const [shown, setShown] = useState(true);
  const hide = () => {
    setShown(false);
  };
  if (!shown) {
    return null;
  }
  return lostRace === null ? (
    <LateCard holdSeconds={holdSeconds} onBack={hide} />
  ) : (
    <LostCard onBack={hide} />
  );
};

const SignalLost = ({
  holdSeconds,
  lostAt,
  backToBar,
}: {
  readonly holdSeconds: number;
  readonly lostAt: number;
  readonly backToBar: () => void;
}) => {
  const now = useNow();
  const holdMs = holdSeconds * 1000;
  const leftMs = holdMs - (now - lostAt);
  if (leftMs <= 0) {
    return <LateCard holdSeconds={holdSeconds} onBack={backToBar} />;
  }
  return (
    <Backdrop>
      <RoomCard label="Signal lost" title="Your bike is still rolling">
        <HoldTimer holdMs={holdMs} leftMs={leftMs} />
        <PanelLine tone="quiet">
          We&apos;re riding it for you. Getting you back on.
        </PanelLine>
        <BarButton onClick={backToBar} />
      </RoomCard>
    </Backdrop>
  );
};

export const GettingBackOn = ({
  awayMs,
  holdSeconds,
}: {
  readonly awayMs: number;
  readonly holdSeconds: number;
}) => {
  const [heardAt] = useState(() => performance.now());
  const now = useNow();
  const holdMs = holdSeconds * 1000;
  return (
    <Backdrop>
      <RoomCard label="Your race is still on" title="Getting you back on">
        <HoldTimer holdMs={holdMs} leftMs={holdMs - awayMs - (now - heardAt)} />
        <PanelLine tone="quiet">
          Loading the road. Then the bike is yours.
        </PanelLine>
      </RoomCard>
    </Backdrop>
  );
};

const BikeUp = ({ feed }: { readonly feed: HudFeed }) => {
  const { position } = useSyncExternalStore(
    feed.subscribe,
    feed.read,
    () => idleHud
  );
  const [shown, setShown] = useState(true);
  useEffect(() => {
    const hiding = setTimeout(() => {
      setShown(false);
    }, BIKE_UP_MS);
    return () => {
      clearTimeout(hiding);
    };
  }, []);
  return shown ? (
    <div
      className="bg-ink/95 text-paper notice-in border-green absolute top-[6%] left-1/2 flex -translate-x-1/2 flex-col border-l-4 px-6 py-2 whitespace-nowrap shadow-xl"
      role="status"
    >
      <span className="font-display tracking-display text-3xl font-extrabold uppercase">
        Your bike is up
      </span>
      <span className="text-paper/70">
        You&apos;re running {ordinal(position).toLowerCase()}. Go.
      </span>
    </div>
  ) : null;
};

const RoomStall = ({ feed }: { readonly feed: HudFeed }) => {
  const read = (): number | null => {
    const { stallLeftMs } = feed.read();
    return stallLeftMs === null
      ? null
      : Math.max(0, Math.ceil(stallLeftMs / 1000));
  };
  const seconds = useSyncExternalStore(feed.subscribe, read, read);
  return (
    <>
      <p className="sr-only" role="status">
        {seconds === null ? null : "Waiting for the room. Your link stalled."}
      </p>
      {seconds !== null && (
        <div
          aria-hidden="true"
          className="bg-ink/95 text-paper notice-in border-neon-yellow absolute top-[12%] left-1/2 flex -translate-x-1/2 flex-col border-l-4 px-6 py-2 whitespace-nowrap shadow-xl"
        >
          <span className="font-display tracking-display text-3xl font-extrabold uppercase">
            Waiting for the room
          </span>
          <span className="text-paper/70">
            Your link stalled.{" "}
            {seconds > 0 ? (
              <>
                Reconnecting in <span className="numeric">{seconds}</span> s.
              </>
            ) : (
              "Reconnecting now."
            )}
          </span>
        </div>
      )}
    </>
  );
};

type RoomOnPage = Pick<
  RoomRun,
  "awayMs" | "holdSeconds" | "pressed" | "reportNow" | "stoppedDrawing"
>;

const useRoomPage = (room: RoomOnPage): void => {
  useEffect(() => {
    const pressed = (event: KeyboardEvent): void => {
      if (!event.repeat) {
        room.pressed();
      }
    };
    const hidden = (): void => {
      if (document.hidden) {
        room.stoppedDrawing();
      }
    };
    globalThis.addEventListener("keydown", pressed);
    globalThis.addEventListener("pagehide", room.reportNow);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      globalThis.removeEventListener("keydown", pressed);
      globalThis.removeEventListener("pagehide", room.reportNow);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [room]);
};

export const RoomNotices = ({
  feed,
  onBackToBar,
  room,
  stage,
}: {
  readonly feed: HudFeed;
  readonly onBackToBar: () => void;
  readonly room: RoomOnPage;
  readonly stage: RaceStage;
}) => {
  useRoomPage(room);
  switch (stage.kind) {
    case "riding": {
      return (
        <>
          {room.awayMs !== null && <BikeUp feed={feed} />}
          <RoomStall feed={feed} />
        </>
      );
    }
    case "signalLost": {
      return (
        <SignalLost
          backToBar={onBackToBar}
          holdSeconds={room.holdSeconds}
          lostAt={stage.lostAt}
        />
      );
    }
    case "paused":
    case "finishing":
    case "consequence": {
      return null;
    }
    default: {
      return stage satisfies never;
    }
  }
};
