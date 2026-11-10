import { artUrl } from "./art.ts";

export const plates = {
  badge: artUrl("clubhouse/badge.webp"),
  counter: artUrl("clubhouse/bar/counter.webp"),
  dusk: artUrl("clubhouse/bar/dusk.webp"),
  night: artUrl("clubhouse/bar/night.webp"),
  noteCyan: artUrl("clubhouse/note-cyan.webp"),
  noteMagenta: artUrl("clubhouse/note-magenta.webp"),
  rays: artUrl("clubhouse/bar/rays.webp"),
  speech: artUrl("clubhouse/speech.webp"),
  standings: artUrl("clubhouse/standings.webp"),
  stool: artUrl("clubhouse/bar/stool.webp"),
  wall: artUrl("clubhouse/wall.webp"),
} as const;

export const gameOverPlates = {
  backdrop: artUrl("clubhouse/game-over/backdrop.webp"),
} as const;

export const garagePlates = {
  backdrop: artUrl("clubhouse/garage/backdrop.webp"),
  mechanic: artUrl("clubhouse/garage/mechanic.webp"),
} as const;
