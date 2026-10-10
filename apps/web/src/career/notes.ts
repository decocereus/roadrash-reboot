import type { RivalIncidents } from "@racer/career/outcome";
import type { BoardNote, RacerId } from "@racer/career/state";
import { roads } from "@racer/career/tables";
import { formatMoney } from "@racer/ui/components/money";

import { pronouns, shortNames } from "./copy.ts";
import { bikeName, kmMark, weaponLabel } from "./format.ts";

const INCIDENT_LINES = 2;

export const racerName = (racer: RacerId): string =>
  racer === "player" ? "You" : shortNames[racer];

export const boardNote = (note: BoardNote): string => {
  if (note.kind === "weaponWanted") {
    return `${shortNames[note.rival]} wants ${pronouns[note.rival].their} ${weaponLabel(note.weapon)} back.`;
  }
  if (note.kind === "wentDown") {
    return `${shortNames[note.rival]} went down at ${kmMark(note.km)} km on ${roads[note.roadId].name}. Ask ${pronouns[note.rival].them} about it.`;
  }
  if (note.kind === "knockedPlayerDown") {
    return `${shortNames[note.rival]} put you down at ${kmMark(note.km)} km on ${roads[note.roadId].name}. Everybody saw.`;
  }
  if (note.kind === "photoFinish") {
    return `Photo finish: ${racerName(note.winner)} by a wheel over ${racerName(note.loser)}.`;
  }
  if (note.kind === "busted") {
    return `${shortNames[note.rival]}: busted on ${roads[note.roadId].name}. Fine ${formatMoney(note.fine)}.`;
  }
  if (note.kind === "newBike") {
    return `New at the garage: ${bikeName(note.bikeId)}.`;
  }
  if (note.kind === "repossessed") {
    return `The garage took the ${bikeName(note.bikeId)}. You ride the Gutter Pup now. Stay on it.`;
  }
  return "You left a race. The bike didn't make it home.";
};

export const signedByVic = (note: BoardNote): boolean =>
  note.kind === "leftRace";

export interface IncidentLine {
  readonly racer: RacerId;
  readonly text: string;
}

const incidentLine = (incident: RivalIncidents): string | null => {
  const name = shortNames[incident.rival];
  if (incident.knockedDownByPlayer > 0) {
    return `you knocked ${name} down at ${kmMark(incident.knockdownKm)} km`;
  }
  if (incident.knockedPlayerDown > 0) {
    return `${name} knocked you down at ${kmMark(incident.knockedPlayerDownKm)} km`;
  }
  if (incident.weaponTakenByPlayer !== "none") {
    return `you took ${name}'s ${weaponLabel(incident.weaponTakenByPlayer).toLowerCase()}`;
  }
  return incident.beatPlayerByAWheel || incident.lostToPlayerByAWheel
    ? "by a wheel"
    : null;
};

export const incidentLines = (
  incidents: readonly RivalIncidents[]
): readonly IncidentLine[] =>
  incidents
    .flatMap((incident): IncidentLine[] => {
      const text = incidentLine(incident);
      return text === null ? [] : [{ racer: incident.rival, text }];
    })
    .slice(0, INCIDENT_LINES);
