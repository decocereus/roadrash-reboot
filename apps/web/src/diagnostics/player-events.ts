import { MAX_EVENTS_IN_BATCH } from "@racer/telemetry/limits";
import type { BrowserFamily } from "@racer/telemetry/limits";
import type { PlayerEvent } from "@racer/telemetry/player-events";

import type { SettingsStore } from "./settings.ts";

const FLUSH_MS = 5000;
const PLAYER_KEY = "rushline.player.v1";
const CARD_LENGTH = 120;
const DEBUG_EXTENSION = "WEBGL_debug_renderer_info";
const UNMASKED_RENDERER = 0x92_46;

interface Timers {
  readonly now: () => number;
  readonly after: (ms: number, run: () => void) => void;
}

interface PlayerEventParts extends Timers {
  readonly build: string;
  readonly playerId: () => string;
  readonly send: (body: string) => boolean;
  readonly settings: Pick<SettingsStore, "read" | "subscribe">;
}

export interface PlayerEvents {
  readonly dropped: () => number;
  readonly flush: () => void;
  readonly track: (event: PlayerEvent) => void;
}

export const createPlayerEvents = ({
  after,
  build,
  now,
  playerId,
  send,
  settings,
}: PlayerEventParts): PlayerEvents => {
  let pending: { readonly at: number; readonly event: PlayerEvent }[] = [];
  let armed = false;
  let flushes = 0;
  let dropped = 0;

  const flush = (): void => {
    armed = false;
    flushes += 1;
    const leaving = pending;
    pending = [];
    if (leaving.length === 0) {
      return;
    }
    const sentAt = now();
    try {
      const sent = send(
        JSON.stringify({
          build,
          events: leaving.map(({ at, event }) => ({
            agoMs: sentAt - at,
            event,
          })),
          playerId: playerId(),
        })
      );
      dropped += sent ? 0 : leaving.length;
    } catch {
      dropped += leaving.length;
    }
  };

  const sharing = () => settings.read().raceData;
  settings.subscribe(() => {
    if (!sharing()) {
      flush();
    }
  });

  return {
    dropped: () => dropped,
    flush,
    track(event) {
      if (!sharing()) {
        return;
      }
      pending.push({ at: now(), event });
      if (pending.length >= MAX_EVENTS_IN_BATCH) {
        flush();
      } else if (!armed) {
        armed = true;
        const armedAt = flushes;
        after(FLUSH_MS, () => {
          if (armedAt === flushes) {
            flush();
          }
        });
      }
    },
  };
};

export const browserFamilyOf = (userAgent: string): BrowserFamily => {
  const marks: readonly (readonly [string, BrowserFamily])[] = [
    ["Edg/", "edge"],
    ["OPR/", "opera"],
    ["Firefox/", "firefox"],
    ["Chrome/", "chrome"],
    ["Safari/", "safari"],
  ];
  return marks.find(([mark]) => userAgent.includes(mark))?.[1] ?? "other";
};

export const graphicsCard = (): string => {
  const gl = document.createElement("canvas").getContext("webgl2");
  if (!gl) {
    return "none";
  }
  const name = String(
    gl.getParameter(
      gl.getExtension(DEBUG_EXTENSION) === null
        ? gl.RENDERER
        : UNMASKED_RENDERER
    )
  );
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  return name.slice(0, CARD_LENGTH);
};

export const storedPlayerId = (device: Storage | null): string => {
  const fresh = crypto.randomUUID();
  try {
    const known = device?.getItem(PLAYER_KEY) ?? "";
    if (known !== "") {
      return known;
    }
    device?.setItem(PLAYER_KEY, fresh);
    return fresh;
  } catch {
    return fresh;
  }
};
