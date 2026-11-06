import * as Option from "effect/Option";

import { encodeRoomMessage } from "./messages.ts";
import { encodeQueueMessage } from "./queue-messages.ts";

interface GateRule {
  readonly binding: string;
  readonly limit: number;
  readonly namespaceId: number;
  readonly period: 10 | 60;
}

export const gateRules = {
  open: { binding: "GATE_OPEN", limit: 6, namespaceId: 26_110, period: 60 },
  queue: { binding: "GATE_QUEUE", limit: 20, namespaceId: 26_111, period: 60 },
  seat: { binding: "GATE_SEAT", limit: 60, namespaceId: 26_112, period: 60 },
} as const satisfies Record<string, GateRule>;

export type Gate = keyof typeof gateRules;

export const ROOM_LIMITED = encodeRoomMessage({
  kind: "refused",
  reason: "limited",
});

export const QUEUE_LIMITED = encodeQueueMessage({
  kind: "refused",
  reason: "limited",
});

const IPV6_GROUPS = 8;
const IPV6_NETWORK_GROUPS = 4;

const isLoopback = (address: string): boolean =>
  address === "::1" || address.startsWith("127.");

const groupsOf = (part: string): readonly string[] =>
  part === "" ? [] : part.split(":");

const ipv6Network = (address: string): string => {
  const [head = "", tail] = address.toLowerCase().split("::");
  const front = groupsOf(head);
  const back = tail === undefined ? [] : groupsOf(tail);
  const zeros = Array.from(
    { length: IPV6_GROUPS - front.length - back.length },
    () => "0"
  );
  return [...front, ...zeros, ...back]
    .slice(0, IPV6_NETWORK_GROUPS)
    .map((group) => group.replace(/^0+(?=.)/u, ""))
    .join(":");
};

export const gatedClient = (
  edgeAddress: Option.Option<string>
): Option.Option<string> =>
  edgeAddress.pipe(
    Option.filter((address) => !isLoopback(address)),
    Option.map((address) =>
      address.includes(":") ? `${ipv6Network(address)}::/64` : address
    )
  );
