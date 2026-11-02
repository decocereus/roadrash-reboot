import type { FeatureEntry } from "./feature-map.ts";

export const roomFeatures: readonly FeatureEntry[] = [
  {
    docs: [
      "docs/architecture.md#race-rooms",
      "docs/coding-standards.md#keep-the-simulation-deterministic",
      "docs/design/game-design.md#12-multiplayer",
    ],
    id: "race-room",
    kind: "platform",
    owns: [
      "packages/sim/src/room*.ts",
      "packages/career/src/room-race*.ts",
      "apps/rooms/**",
      "apps/web/src/components/room-lobby.tsx",
      "tools/rooms/**",
    ],
    perf: [
      "room.tick.p95",
      "room.confirm.p95",
      "room.rollback.p95",
      "room.allocatedBytesPerTick",
      "room.client.allocatedBytesPerTick",
      "room.frame.allocatedBytesPerTick",
    ],
    start: [
      "apps/rooms/src/host.ts",
      "packages/sim/src/room.ts",
      "packages/sim/src/room-client.ts",
    ],
    summary:
      "The race room's rules: the setup that seats up to eight humans with pacing off, the authority that accepts each rider's controls by tick and holds, coasts or hands a silent seat to the pilot, the input and tick packets, and the client that predicts ahead of the room and rolls back to its confirmed race when a frame differs from its guess. The room runs on the `RaceServer` Durable Object in `apps/rooms`, with WebSocket seats and the 60 Hz tick loop, and `pnpm rooms:race` races scripted seats against it.",
    title: "Race rooms",
    verify: ["race-room.md"],
  },
];
