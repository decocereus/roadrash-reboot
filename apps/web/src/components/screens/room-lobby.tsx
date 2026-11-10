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
import type { QueueRefusal } from "@racer/rooms/queue-messages";
import type { SeatPhase } from "@racer/rooms/seat-client";
import { bikes } from "@racer/sim/bikes";
import { tiers } from "@racer/sim/difficulty";
import { MOST_SEATS } from "@racer/sim/room";
import { roadIds } from "@racer/track/road";
import {
  PanelLine,
  PanelRule,
  PanelTitle,
} from "@racer/ui/components/kit-panel";
import {
  MemberRow,
  OptionChips,
  RowList,
  SettingRow,
} from "@racer/ui/components/kit-rows";
import {
  SkewButton,
  TextButton,
  TextLinks,
} from "@racer/ui/components/skew-button";
import { cn } from "@racer/ui/utils";

import { RiderChip } from "./shared.tsx";

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

const countWords = [
  "No one",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
] as const;

const countOf = (count: number): string => countWords[count] ?? String(count);

const UPDATED_LINE = "The game has updated. Reload to join.";
const LIMITED_LINE =
  "Too many riders joined from your network. Try again in a minute.";

const refusalLine = (refusal: Refusal): string => {
  switch (refusal) {
    case "build":
    case "content": {
      return UPDATED_LINE;
    }
    case "flooded": {
      return "The room threw you out for sending too much at once.";
    }
    case "full": {
      return "This lobby is full.";
    }
    case "limited": {
      return LIMITED_LINE;
    }
    case "replaced": {
      return "You opened this lobby in another tab.";
    }
    default: {
      return refusal satisfies never;
    }
  }
};

const statusOf = (phase: SeatPhase, refusal: Refusal | null): string => {
  switch (phase) {
    case "connecting":
    case "lobby": {
      return "Finding the lobby.";
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
      return "You left this lobby.";
    }
    case "lost": {
      return "Getting back to the lobby.";
    }
    case "refused": {
      return refusal ? refusalLine(refusal) : "You can't get in right now.";
    }
    default: {
      return phase satisfies never;
    }
  }
};

const mustReload = (refusal: Refusal | QueueRefusal | null): boolean =>
  refusal === "build" || refusal === "content";

const ReloadOrLeave = ({
  reload,
  leave,
  onLeave,
}: {
  readonly reload: boolean;
  readonly leave: string;
  readonly onLeave: () => void;
}) => (
  <>
    {reload && (
      <SkewButton
        onClick={() => {
          globalThis.location.reload();
        }}
        title="Reload"
        tone="primary"
      />
    )}
    <TextLinks>
      <TextButton onClick={onLeave}>{leave}</TextButton>
    </TextLinks>
  </>
);

const roadOptions = roadIds.map((value) => ({
  label: roads[value].name,
  value,
}));
const tierOptions = tiers.map((value) => ({
  label: String(value),
  value: String(value),
}));
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
  <SettingRow label={label}>
    <span className="text-paper/80 text-base">{value}</span>
  </SettingRow>
);

export const RuleLines = ({ rule }: { readonly rule: RoomRule }) => (
  <RowList aria-label="The rules">
    <RuleLine label="Road" value={roads[rule.roadId].name} />
    <RuleLine label="Tier" value={String(rule.tier)} />
    <RuleLine label="Traffic" value={trafficLabels[rule.traffic]} />
    <RuleLine label="Police" value={policeLabels[rule.police]} />
    <RuleLine label="Bike" value={`${bikes[rule.bikeId].name}, same for all`} />
    <RuleLine label="Rank" value="Doesn't count" />
  </RowList>
);

export const RuleChoices = ({
  rule,
  onChoose,
}: {
  readonly rule: RoomRule;
  readonly onChoose: (choice: Partial<RoomChoice>) => void;
}) => (
  <>
    <RowList aria-label="Your rules">
      <SettingRow label="Road">
        <OptionChips
          label="Road"
          onChange={(roadId) => {
            onChoose({ roadId });
          }}
          options={roadOptions}
          value={rule.roadId}
        />
      </SettingRow>
      <SettingRow label="Tier">
        <OptionChips
          label="Tier"
          onChange={(picked) => {
            const tier = tiers.find((each) => String(each) === picked);
            if (tier !== undefined) {
              onChoose({ tier });
            }
          }}
          options={tierOptions}
          value={String(rule.tier)}
        />
      </SettingRow>
      <SettingRow label="Traffic">
        <OptionChips
          label="Traffic"
          onChange={(traffic) => {
            onChoose({ traffic });
          }}
          options={trafficOptions}
          value={rule.traffic}
        />
      </SettingRow>
      <SettingRow label="Police">
        <OptionChips
          label="Police"
          onChange={(police) => {
            onChoose({ police });
          }}
          options={policeOptions}
          value={rule.police}
        />
      </SettingRow>
    </RowList>
    <PanelLine tone="quiet">
      Changing a rule clears everyone's ready, so nobody races on rules they
      didn't see.
    </PanelLine>
  </>
);

const memberState = (
  member: RoomLobbyMessage["members"][number],
  phase: RoomLobbyMessage["phase"]
): string => {
  if (!member.here) {
    return "Away";
  }
  if (phase === "racing") {
    return "";
  }
  return member.ready ? "Ready" : "Not ready";
};

const roundTripTones = [
  { below: 150, tone: "text-paper/70" },
  { below: 250, tone: "text-neon-yellow" },
] as const;

const roundTripTone = (rttMs: number): string =>
  roundTripTones.find(({ below }) => rttMs < below)?.tone ?? "text-neon-red";

const RoundTrip = ({ rttMs }: { readonly rttMs: number | null }) =>
  rttMs === null ? null : (
    <span className={cn("text-base tabular-nums", roundTripTone(rttMs))}>
      {rttMs} ms
    </span>
  );

const clockOf = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

export const startLine = (
  lobby: Pick<RoomLobbyMessage, "phase" | "rule">,
  startsInSeconds: number | null
): string => {
  if (lobby.phase === "racing") {
    return "A race is running. You ride the next one.";
  }
  const road = roads[lobby.rule.roadId].name;
  return startsInSeconds === null
    ? `${road}. Starts when everyone is ready.`
    : `${road}. Starts when everyone is ready, or in ${clockOf(startsInSeconds)}.`;
};

export const MemberRows = ({ lobby }: { readonly lobby: RoomLobbyMessage }) => (
  <>
    <RowList aria-label="Riders in this lobby">
      {lobby.members.map((member) => (
        <MemberRow
          chip={<RiderChip colour={member.colour} />}
          extra={
            <>
              {member.id === lobby.hostId && (
                <span className="text-neon-yellow text-base font-bold uppercase">
                  Host
                </span>
              )}
              <RoundTrip rttMs={member.rttMs} />
            </>
          }
          key={member.id}
          me={member.id === lobby.you}
          name={member.id === lobby.you ? `${member.name} (you)` : member.name}
          ready={member.ready && member.here}
          state={memberState(member, lobby.phase)}
        />
      ))}
    </RowList>
    <PanelLine tone="quiet">
      {ROOM_FIELD_SIZE - lobby.members.filter(({ here }) => here).length} street
      riders join to make {ROOM_FIELD_SIZE}.
    </PanelLine>
    {lobby.members.some(({ rttMs }) => rttMs !== null) && (
      <PanelLine tone="quiet">
        The ms by each rider is their round trip to this room, as their browser
        measures it.
      </PanelLine>
    )}
  </>
);

export const RoomStatusPart = ({
  phase,
  refusal,
  onLeave,
}: {
  readonly phase: SeatPhase;
  readonly refusal: Refusal | null;
  readonly onLeave: () => void;
}) => (
  <>
    <PanelLine aria-live="polite">{statusOf(phase, refusal)}</PanelLine>
    <ReloadOrLeave
      leave="Leave"
      onLeave={onLeave}
      reload={mustReload(refusal)}
    />
  </>
);

export const RoomFailedPart = ({
  failure,
  onLeave,
}: {
  readonly failure: string;
  readonly onLeave: () => void;
}) => (
  <>
    <PanelLine role="alert" tone="warn">
      Could not start the game: {failure}
    </PanelLine>
    <ReloadOrLeave leave="Leave" onLeave={onLeave} reload />
  </>
);

const whoIsIn = (names: readonly string[]): string => {
  const [first] = names;
  if (first === undefined) {
    return "Nobody is in yet.";
  }
  return names.length === 1
    ? `${first} is in and wants you on the grid.`
    : `${first} and ${countOf(names.length - 1).toLowerCase()} more are in.`;
};

export const InvitePart = ({
  roomId,
  preview,
  onJoin,
  onNotNow,
}: {
  readonly roomId: string;
  readonly preview: RoomPreview | null;
  readonly onJoin: () => void;
  readonly onNotNow: () => void;
}) => (
  <>
    <PanelTitle face="stencil">{roomId}</PanelTitle>
    <PanelRule />
    {preview ? (
      <>
        <PanelLine>{whoIsIn(preview.names)}</PanelLine>
        <PanelLine tone="quiet">
          These rules hold for everyone in this lobby.
        </PanelLine>
        <RuleLines rule={preview.rule} />
        <SkewButton
          detail={`${countOf(preview.names.length)} of ${countOf(MOST_SEATS).toLowerCase()} in.`}
          onClick={onJoin}
          title="Join"
          tone="primary"
        />
      </>
    ) : (
      <PanelLine tone="quiet">Reading the rules.</PanelLine>
    )}
    <TextLinks>
      <TextButton onClick={onNotNow}>Not now</TextButton>
    </TextLinks>
  </>
);

const queueRefusalLine = (refusal: QueueRefusal): string => {
  switch (refusal) {
    case "build": {
      return UPDATED_LINE;
    }
    case "limited": {
      return LIMITED_LINE;
    }
    case "replaced": {
      return "You opened the queue in another tab.";
    }
    default: {
      return refusal satisfies never;
    }
  }
};

export const FindingPart = ({
  refusal,
  riders,
  waitSeconds,
  onCancel,
}: {
  readonly refusal: QueueRefusal | null;
  readonly riders: number;
  readonly waitSeconds: number;
  readonly onCancel: () => void;
}) => (
  <>
    <PanelTitle>Finding riders</PanelTitle>
    <PanelRule />
    {refusal === null ? (
      <>
        <PanelLine aria-live="polite">
          {countOf(riders)} of {countOf(MOST_SEATS).toLowerCase()} in. Doors
          open at {countOf(MOST_SEATS).toLowerCase()}, or after {waitSeconds} s.
        </PanelLine>
        <PanelLine tone="quiet">Walk around while you wait.</PanelLine>
        <SkewButton onClick={onCancel} title="Cancel" />
      </>
    ) : (
      <>
        <PanelLine role="alert" tone="warn">
          {queueRefusalLine(refusal)}
        </PanelLine>
        <ReloadOrLeave
          leave="Cancel"
          onLeave={onCancel}
          reload={mustReload(refusal)}
        />
      </>
    )}
  </>
);
