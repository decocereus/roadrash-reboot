import { PONG_PACKET_BYTES, readPing, writePong } from "@racer/sim/room-wire";

export const PING_EVERY_MS = 500;
export const DEAD_AFTER_MS = 5000;
export const MOST_UNANSWERED_PINGS = DEAD_AFTER_MS / PING_EVERY_MS;
export const SILENT_SEAT_MS = 10_000;
export const SEAT_WATCH_MS = 1000;

const NO_STAMP = 0;

export const createPongs = (
  roomMs: () => number
): ((ping: DataView) => Uint8Array | null) => {
  const buffer = new ArrayBuffer(PONG_PACKET_BYTES);
  const view = new DataView(buffer);
  return (ping) => {
    const stamp = readPing(ping);
    return stamp < NO_STAMP
      ? null
      : new Uint8Array(buffer, 0, writePong(view, stamp, roomMs()));
  };
};
