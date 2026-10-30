import { hazardKinds } from "@racer/track/hazards";

import {
  cursor,
  putChoice,
  putCount,
  putFlag,
  putFloat,
  putRiderRef,
  putText,
  putTextOrNone,
  takeChoice,
  takeCount,
  takeFlag,
  takeFloat,
  takeRiderRef,
  takeText,
  refuse,
  takeTextOrNone,
  textBytes,
  textOrNoneBytes,
} from "./snapshot-bytes.ts";
import {
  CHOICE_BYTES,
  eventFixedBytes,
  eventTags,
  FLAG_BYTES,
  fixedBytesOf,
  hazardTagFields,
} from "./snapshot-format.ts";
import {
  attackKinds,
  crashCauses,
  hazardEffects,
  weaponKinds,
} from "./state.ts";
import type { HazardTag, RaceEvent, RiderId } from "./state.ts";

const TAG_FIXED_BYTES = fixedBytesOf(hazardTagFields);

const tagBytes = (tag: HazardTag): number =>
  TAG_FIXED_BYTES + textBytes(tag.id) + textOrNoneBytes(tag.command);

const tagOrNoneBytes = (tag: HazardTag | null): number =>
  FLAG_BYTES + (tag === null ? 0 : tagBytes(tag));

export const eventBytes = (event: RaceEvent): number => {
  const fixed = CHOICE_BYTES + eventFixedBytes[event.kind];
  switch (event.kind) {
    case "crash":
    case "nearMiss": {
      return fixed + tagOrNoneBytes(event.hazard);
    }
    case "hazard": {
      return (
        fixed +
        textBytes(event.hazard.id) +
        textOrNoneBytes(event.hazard.command)
      );
    }
    case "attack":
    case "bump":
    case "busted":
    case "finish":
    case "glance":
    case "hit":
    case "knockedDown":
    case "land":
    case "pursuit":
    case "remount":
    case "riderContact":
    case "weaponBroken":
    case "weaponTaken":
    case "wrecked": {
      return fixed;
    }
    default: {
      return event satisfies never;
    }
  }
};

const putTag = (out: DataView, tag: HazardTag): void => {
  putTextOrNone(out, tag.command);
  putText(out, tag.id);
  putChoice(out, hazardKinds, tag.kind);
};

const putTagOrNone = (out: DataView, tag: HazardTag | null): void => {
  putFlag(out, tag !== null);
  if (tag !== null) {
    putTag(out, tag);
  }
};

const takeTag = (from: DataView): HazardTag => {
  const command = takeTextOrNone(from);
  const id = takeText(from);
  return { command, id, kind: takeChoice(from, hazardKinds) };
};

const takeTagOrNone = (from: DataView): HazardTag | null =>
  takeFlag(from) ? takeTag(from) : null;

const putEvent = (out: DataView, event: RaceEvent): void => {
  out.setUint8(cursor.byte, eventTags[event.kind]);
  cursor.byte += CHOICE_BYTES;
  switch (event.kind) {
    case "attack": {
      putChoice(out, attackKinds, event.attack);
      putRiderRef(out, event.rider);
      putFloat(out, event.side);
      putChoice(out, weaponKinds, event.weapon);
      return;
    }
    case "bump":
    case "glance":
    case "remount":
    case "wrecked": {
      putRiderRef(out, event.rider);
      return;
    }
    case "busted": {
      putRiderRef(out, event.cop);
      putFloat(out, event.fine);
      putRiderRef(out, event.rider);
      putFloat(out, event.s);
      putChoice(out, weaponKinds, event.weapon);
      putFloat(out, event.x);
      return;
    }
    case "crash": {
      putRiderRef(out, event.by);
      putChoice(out, crashCauses, event.cause);
      putTagOrNone(out, event.hazard);
      putRiderRef(out, event.rider);
      putFloat(out, event.speed);
      return;
    }
    case "finish": {
      putRiderRef(out, event.rider);
      putFloat(out, event.tick);
      return;
    }
    case "hazard": {
      putChoice(out, hazardEffects, event.effect);
      putTag(out, event.hazard);
      putRiderRef(out, event.rider);
      putFloat(out, event.speed);
      return;
    }
    case "hit": {
      putChoice(out, attackKinds, event.attack);
      putRiderRef(out, event.rider);
      putRiderRef(out, event.target);
      putChoice(out, weaponKinds, event.weapon);
      return;
    }
    case "knockedDown": {
      putRiderRef(out, event.by);
      putRiderRef(out, event.rider);
      putFloat(out, event.speed);
      return;
    }
    case "land": {
      putFloat(out, event.airSeconds);
      putFloat(out, event.impact);
      putRiderRef(out, event.rider);
      putFloat(out, event.s);
      putFloat(out, event.x);
      return;
    }
    case "nearMiss": {
      putFloat(out, event.closingSpeed);
      putTagOrNone(out, event.hazard);
      putRiderRef(out, event.rider);
      return;
    }
    case "pursuit": {
      putRiderRef(out, event.rider);
      putRiderRef(out, event.target);
      return;
    }
    case "riderContact": {
      putRiderRef(out, event.other);
      putRiderRef(out, event.rider);
      return;
    }
    case "weaponBroken": {
      putRiderRef(out, event.rider);
      putChoice(out, weaponKinds, event.weapon);
      return;
    }
    case "weaponTaken": {
      putRiderRef(out, event.rider);
      putRiderRef(out, event.target);
      putChoice(out, weaponKinds, event.weapon);
      return;
    }
    default: {
      return event satisfies never;
    }
  }
};

const riderAt = (from: DataView): RiderId => {
  const id = takeRiderRef(from);
  if (id === null) {
    return refuse("A snapshot holds an event with no rider.");
  }
  return id;
};

const takeEvent = (from: DataView, tag: number): RaceEvent => {
  switch (tag) {
    case eventTags.attack: {
      return {
        attack: takeChoice(from, attackKinds),
        kind: "attack",
        rider: riderAt(from),
        side: takeFloat(from),
        weapon: takeChoice(from, weaponKinds),
      };
    }
    case eventTags.bump: {
      return { kind: "bump", rider: riderAt(from) };
    }
    case eventTags.busted: {
      return {
        cop: riderAt(from),
        fine: takeFloat(from),
        kind: "busted",
        rider: riderAt(from),
        s: takeFloat(from),
        weapon: takeChoice(from, weaponKinds),
        x: takeFloat(from),
      };
    }
    case eventTags.crash: {
      return {
        by: takeRiderRef(from),
        cause: takeChoice(from, crashCauses),
        hazard: takeTagOrNone(from),
        kind: "crash",
        rider: riderAt(from),
        speed: takeFloat(from),
      };
    }
    case eventTags.finish: {
      return { kind: "finish", rider: riderAt(from), tick: takeFloat(from) };
    }
    case eventTags.glance: {
      return { kind: "glance", rider: riderAt(from) };
    }
    case eventTags.hazard: {
      return {
        effect: takeChoice(from, hazardEffects),
        hazard: takeTag(from),
        kind: "hazard",
        rider: riderAt(from),
        speed: takeFloat(from),
      };
    }
    case eventTags.hit: {
      return {
        attack: takeChoice(from, attackKinds),
        kind: "hit",
        rider: riderAt(from),
        target: riderAt(from),
        weapon: takeChoice(from, weaponKinds),
      };
    }
    case eventTags.knockedDown: {
      return {
        by: takeRiderRef(from),
        kind: "knockedDown",
        rider: riderAt(from),
        speed: takeFloat(from),
      };
    }
    case eventTags.land: {
      return {
        airSeconds: takeFloat(from),
        impact: takeFloat(from),
        kind: "land",
        rider: riderAt(from),
        s: takeFloat(from),
        x: takeFloat(from),
      };
    }
    case eventTags.nearMiss: {
      return {
        closingSpeed: takeFloat(from),
        hazard: takeTagOrNone(from),
        kind: "nearMiss",
        rider: riderAt(from),
      };
    }
    case eventTags.pursuit: {
      return {
        kind: "pursuit",
        rider: riderAt(from),
        target: riderAt(from),
      };
    }
    case eventTags.remount: {
      return { kind: "remount", rider: riderAt(from) };
    }
    case eventTags.riderContact: {
      return {
        kind: "riderContact",
        other: riderAt(from),
        rider: riderAt(from),
      };
    }
    case eventTags.weaponBroken: {
      return {
        kind: "weaponBroken",
        rider: riderAt(from),
        weapon: takeChoice(from, weaponKinds),
      };
    }
    case eventTags.weaponTaken: {
      return {
        kind: "weaponTaken",
        rider: riderAt(from),
        target: riderAt(from),
        weapon: takeChoice(from, weaponKinds),
      };
    }
    case eventTags.wrecked: {
      return { kind: "wrecked", rider: riderAt(from) };
    }
    default: {
      return refuse(`A snapshot holds no event with tag ${tag}.`);
    }
  }
};

export const putEvents = (
  out: DataView,
  events: readonly RaceEvent[]
): void => {
  putCount(out, events.length);
  for (const event of events) {
    putEvent(out, event);
  }
};

export const takeEvents = (from: DataView, events: RaceEvent[]): void => {
  const count = takeCount(from);
  events.length = 0;
  for (let index = 0; index < count; index += 1) {
    const tag = from.getUint8(cursor.byte);
    cursor.byte += CHOICE_BYTES;
    events.push(takeEvent(from, tag));
  }
};
