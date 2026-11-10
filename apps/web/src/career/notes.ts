import type { RivalIncidents } from "@racer/career/outcome";
import type { RacerId } from "@racer/career/state";

import { shortNames } from "./copy.ts";
import { kmMark, weaponLabel } from "./format.ts";

const INCIDENT_LINES = 2;

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
