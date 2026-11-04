import {
  policeChoices,
  ROOM_FIELD_SIZE,
  trafficChoices,
} from "@racer/career/room-race";
import type {
  PoliceChoice,
  RoomChoice,
  RoomRule,
  TrafficChoice,
} from "@racer/career/room-race";
import { roads } from "@racer/career/tables";
import type {
  Refusal,
  RoomLobbyMessage,
  RoomPreview,
} from "@racer/rooms/messages";
import type { SeatPhase } from "@racer/rooms/seat-client";
import { bikes } from "@racer/sim/bikes";
import { tiers } from "@racer/sim/difficulty";
import { MOST_SEATS } from "@racer/sim/room";
import { roadIds } from "@racer/track/road";
import { MenuItem, MenuList } from "@racer/ui/components/menu-list";
import { Screen } from "@racer/ui/components/screen";
import { Stencil } from "@racer/ui/components/stencil";
import { cn } from "@racer/ui/utils";
import { useState } from "react";

const trafficLabels = {
  heavy: "Heavy",
  light: "Light",
  normal: "Normal",
} as const satisfies Record<TrafficChoice, string>;

const policeLabels = {
  many: "Many",
  none: "None",
  normal: "Normal",
} as const satisfies Record<PoliceChoice, string>;

const refusalLine = (refusal: Refusal): string => {
  switch (refusal) {
    case "build":
    case "content": {
      return "The game has updated. Reload to join.";
    }
    case "full": {
      return "This room is full.";
    }
    default: {
      return refusal satisfies never;
    }
  }
};

const statusOf = (phase: SeatPhase, refusal: Refusal | null): string => {
  switch (phase) {
    case "connecting": {
      return "Finding the room.";
    }
    case "lobby": {
      return "Finding the room.";
    }
    case "loading": {
      return "Loading the race. The countdown starts when everyone is ready.";
    }
    case "racing": {
      return "Rolling out.";
    }
    case "ended": {
      return "This race is over.";
    }
    case "left": {
      return "You left this room.";
    }
    case "lost": {
      return "Reconnecting to the room.";
    }
    case "refused": {
      return refusal ? refusalLine(refusal) : "This seat was refused.";
    }
    default: {
      return phase satisfies never;
    }
  }
};

interface LobbyActions {
  readonly onBack: () => void;
  readonly onChangeName: () => void;
  readonly onCopyLink: () => void;
}

const lobbyAction = (id: string, actions: LobbyActions): void => {
  if (id === "reload") {
    globalThis.location.reload();
  } else if (id === "copy") {
    actions.onCopyLink();
  } else if (id === "name") {
    actions.onChangeName();
  } else {
    actions.onBack();
  }
};

const mustReload = (refusal: Refusal | null): boolean =>
  refusal === "build" || refusal === "content";

const defaultItem = (phase: SeatPhase, refusal: Refusal | null): string => {
  if (phase === "lobby") {
    return "copy";
  }
  return mustReload(refusal) ? "reload" : "back";
};

export const GuestNameScreen = ({
  onBack,
  onName,
}: {
  readonly onBack: () => void;
  readonly onName: (name: string) => void;
}) => {
  const [typed, setTyped] = useState("");
  return (
    <Screen className="bg-ink">
      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <form
          className="flex flex-col items-center gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            onName(typed);
          }}
        >
          <label className="font-display text-quote text-paper" htmlFor="guest">
            What do they call you?
          </label>
          <input
            autoComplete="nickname"
            autoFocus
            className="font-display text-quote border-paper text-paper border-b bg-transparent text-center"
            id="guest"
            maxLength={12}
            onChange={(event) => {
              setTyped(event.target.value);
            }}
            required
            value={typed}
          />
          <button className="font-display text-paper" type="submit">
            Ride
          </button>
        </form>
        <button
          className="font-display text-paper/60"
          onClick={onBack}
          type="button"
        >
          Leave
        </button>
      </div>
    </Screen>
  );
};

const CHOICE_CLASS = "font-display border-2 px-3 py-1 text-paper";

const ChoiceRow = <Value extends string | number>({
  label,
  options,
  picked,
  onPick,
}: {
  readonly label: string;
  readonly options: readonly {
    readonly label: string;
    readonly value: Value;
  }[];
  readonly picked: Value;
  readonly onPick: (value: Value) => void;
}) => (
  <div className="flex flex-col gap-1">
    <p className="font-display text-paper/60">{label}</p>
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          aria-pressed={option.value === picked}
          className={cn(
            CHOICE_CLASS,
            option.value === picked
              ? "border-neon-yellow text-neon-yellow"
              : "border-paper/40"
          )}
          key={option.value}
          onClick={() => {
            onPick(option.value);
          }}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  </div>
);

const roadOptions = roadIds.map((value) => ({
  label: roads[value].name,
  value,
}));
const tierOptions = tiers.map((value) => ({ label: String(value), value }));
const trafficOptions = trafficChoices.map((value) => ({
  label: trafficLabels[value],
  value,
}));
const policeOptions = policeChoices.map((value) => ({
  label: policeLabels[value],
  value,
}));

const RuleLine = ({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) => (
  <div className="flex justify-between gap-6">
    <span className="font-display text-paper/60">{label}</span>
    <span className="font-display text-paper">{value}</span>
  </div>
);

const RuleLines = ({ rule }: { readonly rule: RoomRule }) => (
  <div className="flex flex-col gap-2">
    <RuleLine label="Road" value={roads[rule.roadId].name} />
    <RuleLine label="Tier" value={String(rule.tier)} />
    <RuleLine label="Traffic" value={trafficLabels[rule.traffic]} />
    <RuleLine label="Police" value={policeLabels[rule.police]} />
    <RuleLine label="Bike" value={`${bikes[rule.bikeId].name}, same for all`} />
    <RuleLine label="Rank" value="Doesn't count" />
  </div>
);

const RuleChoices = ({
  rule,
  onChoose,
}: {
  readonly rule: RoomRule;
  readonly onChoose: (choice: RoomChoice) => void;
}) => (
  <div className="flex flex-col gap-3">
    <ChoiceRow
      label="Road"
      onPick={(roadId) => {
        onChoose({ ...rule, roadId });
      }}
      options={roadOptions}
      picked={rule.roadId}
    />
    <ChoiceRow
      label="Tier"
      onPick={(tier) => {
        onChoose({ ...rule, tier });
      }}
      options={tierOptions}
      picked={rule.tier}
    />
    <ChoiceRow
      label="Traffic"
      onPick={(traffic) => {
        onChoose({ ...rule, traffic });
      }}
      options={trafficOptions}
      picked={rule.traffic}
    />
    <ChoiceRow
      label="Police"
      onPick={(police) => {
        onChoose({ ...rule, police });
      }}
      options={policeOptions}
      picked={rule.police}
    />
    <p className="text-paper/60 text-sm">
      Changing a rule clears everyone's ready, so nobody races on rules they
      didn't see.
    </p>
  </div>
);

const memberState = (
  member: RoomLobbyMessage["members"][number],
  phase: RoomLobbyMessage["phase"]
): string => {
  if (!member.here) {
    return "AWAY";
  }
  if (phase === "racing") {
    return "";
  }
  return member.ready ? "READY" : "NOT READY";
};

const startLine = (
  phase: RoomLobbyMessage["phase"],
  startsInSeconds: number | null
): string => {
  if (phase === "racing") {
    return "A race is running. You ride the next one.";
  }
  return startsInSeconds === null
    ? "Starts when everyone is ready."
    : `Rolling out in ${startsInSeconds} s, ready or not.`;
};

const MemberRows = ({ lobby }: { readonly lobby: RoomLobbyMessage }) => (
  <ul className="flex flex-col gap-1">
    {lobby.members.map((member) => (
      <li
        className="font-display text-paper border-paper/20 flex items-center gap-3 border-b py-1"
        key={member.id}
      >
        <span className="flex-1 truncate">
          {member.name}
          {member.id === lobby.you && " (you)"}
        </span>
        {member.id === lobby.hostId && (
          <span className="text-neon-yellow">HOST</span>
        )}
        <span className={member.ready ? "text-neon-yellow" : "text-paper/60"}>
          {memberState(member, lobby.phase)}
        </span>
      </li>
    ))}
    <li className="font-display text-paper/60 py-1">
      {ROOM_FIELD_SIZE - lobby.members.length} AI riders fill the grid to{" "}
      {ROOM_FIELD_SIZE}.
    </li>
  </ul>
);

export const RoomInviteScreen = ({
  preview,
  roomId,
  onBack,
  onJoin,
}: {
  readonly preview: RoomPreview | null;
  readonly roomId: string;
  readonly onBack: () => void;
  readonly onJoin: () => void;
}) => (
  <Screen className="bg-ink">
    <div className="flex flex-1 flex-col items-center justify-center gap-6">
      <Stencil>{roomId}</Stencil>
      <p className="font-display text-paper">
        You'll see these rules before you join. They apply to everyone here.
      </p>
      {preview && <RuleLines rule={preview.rule} />}
      {preview && (
        <p className="font-display text-paper/60">
          {preview.names.length} of {MOST_SEATS} here.
        </p>
      )}
      <MenuList
        autoFocus
        defaultValue="join"
        label="Invite"
        onSelect={(id) => {
          if (id === "join") {
            onJoin();
          } else {
            onBack();
          }
        }}
      >
        <MenuItem value="join">Join</MenuItem>
        <MenuItem value="back">Not now</MenuItem>
      </MenuList>
    </div>
  </Screen>
);

interface RoomLobbyProps extends LobbyActions {
  readonly copied: boolean;
  readonly lobby: RoomLobbyMessage | null;
  readonly name: string;
  readonly phase: SeatPhase;
  readonly refusal: Refusal | null;
  readonly roomId: string;
  readonly startsInSeconds: number | null;
  readonly onChoose: (choice: RoomChoice) => void;
  readonly onReady: (ready: boolean) => void;
}

const GatheringView = ({
  lobby,
  copied,
  name,
  roomId,
  startsInSeconds,
  onBack,
  onChangeName,
  onChoose,
  onCopyLink,
  onReady,
}: RoomLobbyProps & { readonly lobby: RoomLobbyMessage }) => {
  const me = lobby.members.find((member) => member.id === lobby.you);
  const ready = me?.ready ?? false;
  return (
    <Screen className="bg-ink">
      <div className="grid flex-1 grid-cols-1 gap-8 p-8 md:grid-cols-[minmax(0,1fr)_28rem]">
        <div className="flex min-h-0 flex-col gap-4">
          <Stencil>{roomId}</Stencil>
          <MemberRows lobby={lobby} />
          <p aria-live="polite" className="font-display text-quote text-paper">
            {startLine(lobby.phase, startsInSeconds)}
          </p>
          <p className="font-display text-paper/60">
            Riding as {name}. {copied && "Link copied."}
          </p>
          <MenuList
            autoFocus
            defaultValue={lobby.phase === "gathering" ? "ready" : "copy"}
            key={lobby.phase}
            label="Lobby"
            onSelect={(id) => {
              if (id === "ready") {
                onReady(!ready);
              } else {
                lobbyAction(id, { onBack, onChangeName, onCopyLink });
              }
            }}
          >
            {lobby.phase === "gathering" && (
              <MenuItem value="ready">{ready ? "Not ready" : "Ready"}</MenuItem>
            )}
            <MenuItem value="copy">Copy the link</MenuItem>
            <MenuItem value="name">Change name</MenuItem>
            <MenuItem value="back">Leave</MenuItem>
          </MenuList>
        </div>
        <div className="border-paper/30 flex flex-col gap-4 border-2 p-6">
          <p className="font-display text-quote text-paper">
            {lobby.hostId === lobby.you ? "You set the rules" : "The rules"}
          </p>
          {lobby.hostId === lobby.you && lobby.phase === "gathering" ? (
            <RuleChoices onChoose={onChoose} rule={lobby.rule} />
          ) : (
            <RuleLines rule={lobby.rule} />
          )}
        </div>
      </div>
    </Screen>
  );
};

export const RoomLobbyScreen = (props: RoomLobbyProps) => {
  const { name, phase, roomId, refusal, lobby, copied } = props;
  const { onBack, onChangeName, onCopyLink } = props;
  if (phase === "lobby" && lobby) {
    return <GatheringView {...props} lobby={lobby} />;
  }
  return (
    <Screen className="bg-ink">
      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <Stencil>{roomId}</Stencil>
        <p aria-live="polite" className="font-display text-quote text-paper">
          {statusOf(phase, refusal)}
        </p>
        <p className="font-display text-paper/60">
          Riding as {name}. {copied && "Link copied."}
        </p>
        <MenuList
          key={phase}
          autoFocus
          defaultValue={defaultItem(phase, refusal)}
          label="Room"
          onSelect={(id) => {
            lobbyAction(id, { onBack, onChangeName, onCopyLink });
          }}
        >
          {mustReload(refusal) && <MenuItem value="reload">Reload</MenuItem>}
          <MenuItem value="back">Leave</MenuItem>
        </MenuList>
      </div>
    </Screen>
  );
};
