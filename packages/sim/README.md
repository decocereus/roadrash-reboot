# `@racer/sim`

Pure fixed-step arcade race rules shared by the browser and the authoritative
Cloudflare room.

```ts
import { createRace, inputFor, stepRace } from "@racer/sim";

let state = createRace({
  riders: [{ id: "player-1", name: "Player" }],
  seed: 42,
});

state = stepRace(state, {
  "player-1": inputFor({ throttle: 1, steer: 0.25 }),
});
```

`createRace` always returns four starting slots. Supplied riders are humans by
default; missing slots are deterministic bots. `stepRace` advances exactly one
`1 / 30` second step, fills bot inputs, applies movement, traffic, attacks,
collisions, crash recovery, and finish placement, then returns a serializable
`RaceState` snapshot. Missing human input is neutral input.

The prototype uses a 600 m track and a 60-second default deadline
(`trackLength` and `maxDurationSeconds` can tune them for previews or later
tracks). At the deadline, riders still on the road receive remaining places by
road distance, with rider ID as the deterministic tie-breaker, and the room
transitions to `finished`.

The authoritative snapshot uses `riders[].id`, `name`, `kind`, `lane`,
`roadDistance`, `speed`, `health`, `status`, cooldown and recovery counters,
optional `place`/`lastHitBy`; `traffic[]` carries road-relative objects; and
`events[]` carries attack, hit, collision, crash, recovery, and finish events.

The package has no runtime dependencies. `bun-types` is a development-only
dependency so the Bun test files are typechecked when the workspace installs.
