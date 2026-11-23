const uiCues = [
  "move",
  "press",
  "back",
  "tab",
  "refused",
  "buy",
  "welcome",
  "menuOpen",
  "menuClose",
] as const;

export type UiCue = (typeof uiCues)[number];

export const cues = [
  ...uiCues,
  "shift",
  "swing",
  "hit",
  "weaponHit",
  "thump",
  "whoosh",
  "crash",
  "siren",
  "walkStep",
  "runStep",
  "greet",
  "shove",
  "sit",
  "pose",
  "door",
] as const;

export type Cue = (typeof cues)[number];

export const uiCueOf = (text: string | undefined): UiCue | null =>
  uiCues.find((cue) => cue === text) ?? null;
