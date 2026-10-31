import { hazardKinds } from "@racer/track/hazards";

import {
  CHOICE_BYTES,
  COUNT_BYTES,
  cursor,
  FLAG_BYTES,
  putCount,
  putFlag,
  refuse,
  takeCount,
  takeFlag,
} from "./snapshot-bytes.ts";
import {
  bytesOf,
  choiceAt,
  floatAt,
  putRecord,
  riderAt,
  riderRefAt,
  schemaOf,
  takeRecord,
  textAt,
  textOrNoneAt,
} from "./snapshot-members.ts";
import type { Member, Schema } from "./snapshot-members.ts";
import {
  attackKinds,
  crashCauses,
  hazardEffects,
  PLAYER_RIDER,
  weaponKinds,
} from "./state.ts";
import type { HazardTag, RaceEvent } from "./state.ts";

type EventKind = RaceEvent["kind"];

type EventOf<Kind extends EventKind> = Extract<
  RaceEvent,
  { readonly kind: Kind }
>;

type Mutable<Value> = { -readonly [Key in keyof Value]: Value[Key] };

const tagSchema = schemaOf<HazardTag, HazardTag>({
  command: textOrNoneAt("command"),
  id: textAt("id"),
  kind: choiceAt("kind", hazardKinds),
});

const blankTag = (): HazardTag => ({
  command: null,
  id: "",
  kind: hazardKinds[0],
});

const tagAt = <Key extends string>(
  key: Key
): Member<
  Readonly<Record<Key, HazardTag>>,
  Readonly<Record<Key, HazardTag>>,
  Key
> => ({
  at: key,
  bytes: (value) => bytesOf(tagSchema, value[key]),
  put: (out, value) => {
    putRecord(out, tagSchema, value[key]);
  },
  take: (from, value) => {
    takeRecord(from, tagSchema, value[key]);
  },
});

const tagOrNoneAt = <Key extends string>(
  key: Key
): Member<
  Readonly<Record<Key, HazardTag | null>>,
  Record<Key, HazardTag | null>,
  Key
> => {
  const warm = new WeakMap<object, HazardTag>();
  return {
    at: key,
    bytes: (value) => {
      const tag = value[key];
      return FLAG_BYTES + (tag === null ? 0 : bytesOf(tagSchema, tag));
    },
    put: (out, value) => {
      const tag = value[key];
      putFlag(out, tag !== null);
      if (tag !== null) {
        putRecord(out, tagSchema, tag);
      }
    },
    take: (from, value) => {
      if (takeFlag(from)) {
        const tag = value[key] ?? warm.get(value) ?? blankTag();
        takeRecord(from, tagSchema, tag);
        warm.set(value, tag);
        value[key] = tag;
        return;
      }
      value[key] = null;
    },
  };
};

type EventSchemas = {
  readonly [Kind in EventKind]: Schema<
    Omit<EventOf<Kind>, "kind">,
    Omit<Mutable<EventOf<Kind>>, "kind">
  >;
};

export const eventSchemas: EventSchemas = {
  attack: schemaOf<
    Omit<EventOf<"attack">, "kind">,
    Omit<Mutable<EventOf<"attack">>, "kind">
  >({
    attack: choiceAt("attack", attackKinds),
    rider: riderAt("rider"),
    side: floatAt("side"),
    weapon: choiceAt("weapon", weaponKinds),
  }),
  bump: schemaOf<
    Omit<EventOf<"bump">, "kind">,
    Omit<Mutable<EventOf<"bump">>, "kind">
  >({ rider: riderAt("rider") }),
  busted: schemaOf<
    Omit<EventOf<"busted">, "kind">,
    Omit<Mutable<EventOf<"busted">>, "kind">
  >({
    cop: riderAt("cop"),
    fine: floatAt("fine"),
    rider: riderAt("rider"),
    s: floatAt("s"),
    weapon: choiceAt("weapon", weaponKinds),
    x: floatAt("x"),
  }),
  crash: schemaOf<
    Omit<EventOf<"crash">, "kind">,
    Omit<Mutable<EventOf<"crash">>, "kind">
  >({
    by: riderRefAt("by"),
    cause: choiceAt("cause", crashCauses),
    hazard: tagOrNoneAt("hazard"),
    rider: riderAt("rider"),
    speed: floatAt("speed"),
  }),
  finish: schemaOf<
    Omit<EventOf<"finish">, "kind">,
    Omit<Mutable<EventOf<"finish">>, "kind">
  >({
    rider: riderAt("rider"),
    tick: floatAt("tick"),
  }),
  glance: schemaOf<
    Omit<EventOf<"glance">, "kind">,
    Omit<Mutable<EventOf<"glance">>, "kind">
  >({
    rider: riderAt("rider"),
  }),
  hazard: schemaOf<
    Omit<EventOf<"hazard">, "kind">,
    Omit<Mutable<EventOf<"hazard">>, "kind">
  >({
    effect: choiceAt("effect", hazardEffects),
    hazard: tagAt("hazard"),
    rider: riderAt("rider"),
    speed: floatAt("speed"),
  }),
  hit: schemaOf<
    Omit<EventOf<"hit">, "kind">,
    Omit<Mutable<EventOf<"hit">>, "kind">
  >({
    attack: choiceAt("attack", attackKinds),
    rider: riderAt("rider"),
    target: riderAt("target"),
    weapon: choiceAt("weapon", weaponKinds),
  }),
  knockedDown: schemaOf<
    Omit<EventOf<"knockedDown">, "kind">,
    Omit<Mutable<EventOf<"knockedDown">>, "kind">
  >({
    by: riderRefAt("by"),
    rider: riderAt("rider"),
    speed: floatAt("speed"),
  }),
  land: schemaOf<
    Omit<EventOf<"land">, "kind">,
    Omit<Mutable<EventOf<"land">>, "kind">
  >({
    airSeconds: floatAt("airSeconds"),
    impact: floatAt("impact"),
    rider: riderAt("rider"),
    s: floatAt("s"),
    x: floatAt("x"),
  }),
  nearMiss: schemaOf<
    Omit<EventOf<"nearMiss">, "kind">,
    Omit<Mutable<EventOf<"nearMiss">>, "kind">
  >({
    closingSpeed: floatAt("closingSpeed"),
    hazard: tagOrNoneAt("hazard"),
    rider: riderAt("rider"),
  }),
  pursuit: schemaOf<
    Omit<EventOf<"pursuit">, "kind">,
    Omit<Mutable<EventOf<"pursuit">>, "kind">
  >({
    rider: riderAt("rider"),
    target: riderAt("target"),
  }),
  remount: schemaOf<
    Omit<EventOf<"remount">, "kind">,
    Omit<Mutable<EventOf<"remount">>, "kind">
  >({
    rider: riderAt("rider"),
  }),
  riderContact: schemaOf<
    Omit<EventOf<"riderContact">, "kind">,
    Omit<Mutable<EventOf<"riderContact">>, "kind">
  >({
    other: riderAt("other"),
    rider: riderAt("rider"),
  }),
  weaponBroken: schemaOf<
    Omit<EventOf<"weaponBroken">, "kind">,
    Omit<Mutable<EventOf<"weaponBroken">>, "kind">
  >({
    rider: riderAt("rider"),
    weapon: choiceAt("weapon", weaponKinds),
  }),
  weaponTaken: schemaOf<
    Omit<EventOf<"weaponTaken">, "kind">,
    Omit<Mutable<EventOf<"weaponTaken">>, "kind">
  >({
    rider: riderAt("rider"),
    target: riderAt("target"),
    weapon: choiceAt("weapon", weaponKinds),
  }),
  wrecked: schemaOf<
    Omit<EventOf<"wrecked">, "kind">,
    Omit<Mutable<EventOf<"wrecked">>, "kind">
  >({
    rider: riderAt("rider"),
  }),
};

export const eventTags = {
  attack: 0,
  bump: 1,
  busted: 2,
  crash: 3,
  finish: 4,
  glance: 5,
  hazard: 6,
  hit: 7,
  knockedDown: 8,
  land: 9,
  nearMiss: 10,
  pursuit: 11,
  remount: 12,
  riderContact: 13,
  weaponBroken: 14,
  weaponTaken: 15,
  wrecked: 16,
} satisfies Record<EventKind, number>;

const eventKinds = [
  "attack",
  "bump",
  "busted",
  "crash",
  "finish",
  "glance",
  "hazard",
  "hit",
  "knockedDown",
  "land",
  "nearMiss",
  "pursuit",
  "remount",
  "riderContact",
  "weaponBroken",
  "weaponTaken",
  "wrecked",
] as const satisfies readonly EventKind[];

const blankEvents = {
  attack: () => ({
    attack: attackKinds[0],
    kind: "attack",
    rider: PLAYER_RIDER,
    side: 0,
    weapon: weaponKinds[0],
  }),
  bump: () => ({ kind: "bump", rider: PLAYER_RIDER }),
  busted: () => ({
    cop: PLAYER_RIDER,
    fine: 0,
    kind: "busted",
    rider: PLAYER_RIDER,
    s: 0,
    weapon: weaponKinds[0],
    x: 0,
  }),
  crash: () => ({
    by: null,
    cause: crashCauses[0],
    hazard: null,
    kind: "crash",
    rider: PLAYER_RIDER,
    speed: 0,
  }),
  finish: () => ({ kind: "finish", rider: PLAYER_RIDER, tick: 0 }),
  glance: () => ({ kind: "glance", rider: PLAYER_RIDER }),
  hazard: () => ({
    effect: hazardEffects[0],
    hazard: blankTag(),
    kind: "hazard",
    rider: PLAYER_RIDER,
    speed: 0,
  }),
  hit: () => ({
    attack: attackKinds[0],
    kind: "hit",
    rider: PLAYER_RIDER,
    target: PLAYER_RIDER,
    weapon: weaponKinds[0],
  }),
  knockedDown: () => ({
    by: null,
    kind: "knockedDown",
    rider: PLAYER_RIDER,
    speed: 0,
  }),
  land: () => ({
    airSeconds: 0,
    impact: 0,
    kind: "land",
    rider: PLAYER_RIDER,
    s: 0,
    x: 0,
  }),
  nearMiss: () => ({
    closingSpeed: 0,
    hazard: null,
    kind: "nearMiss",
    rider: PLAYER_RIDER,
  }),
  pursuit: () => ({
    kind: "pursuit",
    rider: PLAYER_RIDER,
    target: PLAYER_RIDER,
  }),
  remount: () => ({ kind: "remount", rider: PLAYER_RIDER }),
  riderContact: () => ({
    kind: "riderContact",
    other: PLAYER_RIDER,
    rider: PLAYER_RIDER,
  }),
  weaponBroken: () => ({
    kind: "weaponBroken",
    rider: PLAYER_RIDER,
    weapon: weaponKinds[0],
  }),
  weaponTaken: () => ({
    kind: "weaponTaken",
    rider: PLAYER_RIDER,
    target: PLAYER_RIDER,
    weapon: weaponKinds[0],
  }),
  wrecked: () => ({ kind: "wrecked", rider: PLAYER_RIDER }),
} satisfies { readonly [Kind in EventKind]: () => Mutable<EventOf<Kind>> };

const kindOfTag = (tag: number): EventKind => {
  const kind = eventKinds[tag];
  if (kind === undefined) {
    return refuse(`A snapshot holds no event with tag ${tag}.`);
  }
  return kind;
};

const eventBytes = (event: RaceEvent): number => {
  switch (event.kind) {
    case "attack": {
      return CHOICE_BYTES + bytesOf(eventSchemas.attack, event);
    }
    case "bump": {
      return CHOICE_BYTES + bytesOf(eventSchemas.bump, event);
    }
    case "busted": {
      return CHOICE_BYTES + bytesOf(eventSchemas.busted, event);
    }
    case "crash": {
      return CHOICE_BYTES + bytesOf(eventSchemas.crash, event);
    }
    case "finish": {
      return CHOICE_BYTES + bytesOf(eventSchemas.finish, event);
    }
    case "glance": {
      return CHOICE_BYTES + bytesOf(eventSchemas.glance, event);
    }
    case "hazard": {
      return CHOICE_BYTES + bytesOf(eventSchemas.hazard, event);
    }
    case "hit": {
      return CHOICE_BYTES + bytesOf(eventSchemas.hit, event);
    }
    case "knockedDown": {
      return CHOICE_BYTES + bytesOf(eventSchemas.knockedDown, event);
    }
    case "land": {
      return CHOICE_BYTES + bytesOf(eventSchemas.land, event);
    }
    case "nearMiss": {
      return CHOICE_BYTES + bytesOf(eventSchemas.nearMiss, event);
    }
    case "pursuit": {
      return CHOICE_BYTES + bytesOf(eventSchemas.pursuit, event);
    }
    case "remount": {
      return CHOICE_BYTES + bytesOf(eventSchemas.remount, event);
    }
    case "riderContact": {
      return CHOICE_BYTES + bytesOf(eventSchemas.riderContact, event);
    }
    case "weaponBroken": {
      return CHOICE_BYTES + bytesOf(eventSchemas.weaponBroken, event);
    }
    case "weaponTaken": {
      return CHOICE_BYTES + bytesOf(eventSchemas.weaponTaken, event);
    }
    case "wrecked": {
      return CHOICE_BYTES + bytesOf(eventSchemas.wrecked, event);
    }
    default: {
      return event satisfies never;
    }
  }
};

const putEvent = (out: DataView, event: RaceEvent): void => {
  out.setUint8(cursor.byte, eventTags[event.kind]);
  cursor.byte += CHOICE_BYTES;
  switch (event.kind) {
    case "attack": {
      putRecord(out, eventSchemas.attack, event);
      return;
    }
    case "bump": {
      putRecord(out, eventSchemas.bump, event);
      return;
    }
    case "busted": {
      putRecord(out, eventSchemas.busted, event);
      return;
    }
    case "crash": {
      putRecord(out, eventSchemas.crash, event);
      return;
    }
    case "finish": {
      putRecord(out, eventSchemas.finish, event);
      return;
    }
    case "glance": {
      putRecord(out, eventSchemas.glance, event);
      return;
    }
    case "hazard": {
      putRecord(out, eventSchemas.hazard, event);
      return;
    }
    case "hit": {
      putRecord(out, eventSchemas.hit, event);
      return;
    }
    case "knockedDown": {
      putRecord(out, eventSchemas.knockedDown, event);
      return;
    }
    case "land": {
      putRecord(out, eventSchemas.land, event);
      return;
    }
    case "nearMiss": {
      putRecord(out, eventSchemas.nearMiss, event);
      return;
    }
    case "pursuit": {
      putRecord(out, eventSchemas.pursuit, event);
      return;
    }
    case "remount": {
      putRecord(out, eventSchemas.remount, event);
      return;
    }
    case "riderContact": {
      putRecord(out, eventSchemas.riderContact, event);
      return;
    }
    case "weaponBroken": {
      putRecord(out, eventSchemas.weaponBroken, event);
      return;
    }
    case "weaponTaken": {
      putRecord(out, eventSchemas.weaponTaken, event);
      return;
    }
    case "wrecked": {
      putRecord(out, eventSchemas.wrecked, event);
      return;
    }
    default: {
      event satisfies never;
    }
  }
};

const takeInto = (from: DataView, event: RaceEvent): void => {
  switch (event.kind) {
    case "attack": {
      takeRecord(from, eventSchemas.attack, event);
      return;
    }
    case "bump": {
      takeRecord(from, eventSchemas.bump, event);
      return;
    }
    case "busted": {
      takeRecord(from, eventSchemas.busted, event);
      return;
    }
    case "crash": {
      takeRecord(from, eventSchemas.crash, event);
      return;
    }
    case "finish": {
      takeRecord(from, eventSchemas.finish, event);
      return;
    }
    case "glance": {
      takeRecord(from, eventSchemas.glance, event);
      return;
    }
    case "hazard": {
      takeRecord(from, eventSchemas.hazard, event);
      return;
    }
    case "hit": {
      takeRecord(from, eventSchemas.hit, event);
      return;
    }
    case "knockedDown": {
      takeRecord(from, eventSchemas.knockedDown, event);
      return;
    }
    case "land": {
      takeRecord(from, eventSchemas.land, event);
      return;
    }
    case "nearMiss": {
      takeRecord(from, eventSchemas.nearMiss, event);
      return;
    }
    case "pursuit": {
      takeRecord(from, eventSchemas.pursuit, event);
      return;
    }
    case "remount": {
      takeRecord(from, eventSchemas.remount, event);
      return;
    }
    case "riderContact": {
      takeRecord(from, eventSchemas.riderContact, event);
      return;
    }
    case "weaponBroken": {
      takeRecord(from, eventSchemas.weaponBroken, event);
      return;
    }
    case "weaponTaken": {
      takeRecord(from, eventSchemas.weaponTaken, event);
      return;
    }
    case "wrecked": {
      takeRecord(from, eventSchemas.wrecked, event);
      return;
    }
    default: {
      event satisfies never;
    }
  }
};

type Warm = Map<number, RaceEvent>;

const held = new WeakMap<readonly RaceEvent[], Warm>();

const heldFor = (events: readonly RaceEvent[]): Warm => {
  const mine = held.get(events);
  if (mine) {
    return mine;
  }
  const made: Warm = new Map();
  held.set(events, made);
  return made;
};

const KIND_COUNT = eventKinds.length;

const slotOf = (
  mine: Warm,
  live: readonly RaceEvent[],
  index: number,
  kind: EventKind
): RaceEvent => {
  const at = index * KIND_COUNT + eventTags[kind];
  const standing = live[index];
  if (standing !== undefined && standing.kind === kind) {
    mine.set(at, standing);
    return standing;
  }
  const own = mine.get(at);
  if (own !== undefined) {
    return own;
  }
  const made = blankEvents[kind]();
  mine.set(at, made);
  return made;
};

export const eventsAt = <Key extends string>(
  key: Key
): Member<
  Readonly<Record<Key, readonly RaceEvent[]>>,
  Readonly<Record<Key, RaceEvent[]>>,
  Key
> => ({
  at: key,
  bytes: (value) => {
    let total = COUNT_BYTES;
    for (const event of value[key]) {
      total += eventBytes(event);
    }
    return total;
  },
  put: (out, value) => {
    const events = value[key];
    putCount(out, events.length);
    for (const event of events) {
      putEvent(out, event);
    }
  },
  take: (from, value) => {
    const events = value[key];
    const mine = heldFor(events);
    const count = takeCount(from);
    for (let index = 0; index < count; index += 1) {
      const tag = from.getUint8(cursor.byte);
      cursor.byte += CHOICE_BYTES;
      const event = slotOf(mine, events, index, kindOfTag(tag));
      takeInto(from, event);
      events[index] = event;
    }
    events.length = count;
  },
});
