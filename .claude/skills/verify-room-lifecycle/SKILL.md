---
name: verify-room-lifecycle
description: Model-check how a Rushline race room seats, holds, starts, ends and frees a rider, with TLC on tools/rooms/spec/RoomLifecycle.tla. Use before you change apps/rooms/src (host, lobby, seats, room config), the web room screens (room-lobby.tsx, room-url.ts, rejoin.tsx, guest-name.ts, room-handoff.ts, prepare-outcome.ts), or the spec itself, when a multiplayer bug report names a stuck tab, a lost bike, a ghost in the bar or a spot that never frees, and when someone asks whether a room rule still holds.
---

# Verify the room lifecycle

`tools/rooms/spec/RoomLifecycle.tla` is a TLA+ model of one race room: the Durable Object host and its lobby, the sockets it holds, the seats it holds for riders who drop, and each browser tab with its seat and its door-moment handoff. TLC explores every order of those steps inside small bounds and checks the rules a player would feel. Tests cover the orders someone thought of. This covers every order inside the bounds.

The rule that requires it is in `docs/standards/effect.md`. A change to how a room seats, holds, starts, ends or frees a rider changes the spec in the same pull request, and `pnpm rooms:lifecycle` must pass.

## Does your change touch it

Run the check when your diff touches any covered file. Each action in the spec names the file and function it mirrors in a comment, so search the spec for the function you changed.

| Covered file | What the spec models from it |
| --- | --- |
| `apps/rooms/src/host.ts` | seat, drop, retire, holdSeat, partingOf, rejoin, heldSeatOf, countDownOnceLoaded, watchSeats, restore after a Durable Object restart, the timers START_DELAY_MS, REPORT_GRACE_MS, SILENT_SEAT_MS |
| `apps/rooms/src/host-phase.ts` | the room phase and loadingOver |
| `apps/rooms/src/socket-role.ts` | which socket is a lobby seat and which a race seat |
| `apps/rooms/src/race-seat.ts`, `race-build.ts`, `race-server.ts` | building the race from the seats |
| `apps/rooms/src/room-config.ts` | awaySeconds, seatHoldSeconds, loadDeadlineSeconds, publicGatherSeconds, customStartSeconds, publicStartSeconds, and the rule that AWAY is never shorter than the hold |
| `apps/rooms/src/lobby.ts` | join by member key, freeColour, away, sweep, leave |
| `apps/rooms/src/seat-client.ts` | seatAfter, liveSeatAfter, DEAD_AFTER_MS |
| `apps/web/src/components/room-lobby.tsx` | the door moment, reopening a lost lobby seat, the roomRacing effect |
| `apps/web/src/components/room-url.ts`, `screens/rejoin.tsx` | rejoin=yes, rejoin=no, rejoin=taken |
| `apps/web/src/components/guest-name.ts` | the member key two tabs of one browser share |
| `apps/web/src/room-handoff.ts`, `apps/web/src/prepare-outcome.ts` | seatChange, seatClosing, leaving after a failed boot |
| `packages/sim/src/room.ts` | MOST_SEATS |

A change elsewhere, such as the race simulation or the bar's 3D scene, does not need it.

## Run it

```sh
pnpm rooms:lifecycle
```

The first run downloads a pinned `tla2tools.jar` and a pinned Temurin JRE into `~/.cache/rushline/tla` and checks their SHA-256, so it needs the network once. A full run takes about half an hour on the M4 Pro (2026-11-08): `solo` and `twins` take about eight minutes each, the four other checks four minutes together, and the guard-offs and known defects the rest. Start it as a background command with a timeout of an hour or more. `pnpm rooms:lifecycle --only <name>` runs one check, guard or known defect; the usage line lists the names. TLC is CPU-heavy: if another agent's `pnpm perf` or `pnpm perf:gpu` is running (`ps aux | grep gate.ts`), wait, because the load skews their numbers.

Every line must read `ok`. There are three kinds:

- **Checks** (`full`, `newMember`, `pair`, `public`, `restart`, `solo`, `twins` in `tools/rooms/src/lifecycle-checks.ts`). Each runs TLC with a set of bounds and must find no counterexample to its rules. `restart` is the one check whose room may restart (`Restarts` 1): every other check keeps `Restarts` 0.
- **Guard-offs** (`GUARD_OFFS`). Each turns one `Guard*` constant FALSE, which removes the code behaviour that protects one rule, and TLC must then break that rule. This is the proof that the rule can fail. A guard-off that passes means the model no longer needs that behaviour, which is a modelling error to fix.
- **Known defects** (`KNOWN_DEFECTS`). Each is a real bug in the code that the model shows and that its owner has not fixed. It must still break its rule. When the owner fixes the code, the line fails, and the fix deletes the entry in the same pull request.

`pnpm exec vitest run --project node tools/rooms/test/lifecycle.test.ts` tests the runner and the trace printer. `pnpm exec vitest run --project node apps/rooms/test/room-lifecycle.test.ts` replays TLC's counterexamples against the real host.

## The rules

Each is an invariant or property in the spec with its guard named in the comment above it.

| Rule | In plain words |
| --- | --- |
| `OneSocketPerMember` | A spot is never held by two riders. |
| `SlotNeverShared` | Two members never stand in the same bar spot. |
| `NoGhostInBar` | Nobody walks the bar without a seat behind them. |
| `LeaveFreesSpot` | Leave frees the spot at once. |
| `BootFailureFreesSpot` | A rider whose game failed to boot holds no spot. |
| `TakenTabStaysPut` | A tab whose seat another tab of the same browser took stays on the taken screen until its player acts. |
| `HoldLastsAway` | A dropped rider keeps the same spot until awaySeconds run out. |
| `RejoinKeepsSpot` | A rider who comes back within the hold is the same member with the same spot. |
| `SeatsCanRide` | A race never starts with a seat that cannot ride. |
| `FairStart` | The countdown never leaves a loading rider behind before the load deadline. |
| `ReadyRiderRides` | A rider whose game is ready rides the race the room is running. |
| `BackOnBike` | A dropped rider who comes back as the same member while the room holds their bike gets back on it, unless they chose rejoin=no. |
| `BikeHeldForHold` | The room lets go of a dropped rider's bike only when the hold runs out, the race ends, or the rider chose to leave. |
| `RideSurvivesRestart` | A race the room had checkpointed survives a restart: every rider on a bike is held for the full hold and gets back on through the rejoin path. |
| `NeverStuck` | Every tab ends in the bar, riding, on results, on a screen that says why it is out, or closed. Checked only in `solo`, because liveness is slow. |

## Bounds and what is left out

The bounds are in `CHECKS`: at most three tabs, at most two seats, at most two races, two to four player actions, one or two sockets per tab, and at most one restart of the Durable Object (`HostRestart`), which kills every socket the host held and loses its timers and unsent messages. Time moves in ticks of about five seconds (`TIMERS`), so `Hold` is 1 tick, `Away` 3, `Wait` 3, and anything a live link does happens before the next tick. A pass covers these bounds, not a room of ten riders over an evening.

The model leaves out the race simulation, the join rate limits from #163 (the spec says why near its join action), message loss on a link that stays open, and the browser's own crash. It models the room config at its launch values; `ASSUME Away >= Hold` mirrors the schema check in `room-config.ts`.

## When a line fails

1. Read the counterexample. `lifecycle.ts` prints it as one changed field per line, step by step. Draw it with the `/statechart` skill, which shows the shortest path to each broken rule in plain words. Give it the spec and the config that `configOf` in `lifecycle-checks.ts` writes for the failing check.
2. Replay each step against the code the action names. If a step cannot happen in the code, the model is wrong: fix the model, and say what was wrong in the commit. If every step can happen, it is a bug in the code: add a replay test to `apps/rooms/test/room-lifecycle.test.ts` that drives the real host through the same steps, and report it. Never weaken a rule or a bound to make a check pass.
3. If your change alters a promise on purpose, such as a new hold length or a new way to leave, change the rule's wording and its TLA+ together, cite the evidence (the PR, the owner's decision, the doc), and add a guard whose removal breaks the new rule.

## Keeping it in step with the code

The sync commit is the last commit at which someone confirmed that the spec describes every covered file. Move it forward only after you have read every change to the covered files since the old sync commit, updated the spec where they changed shape, and seen `pnpm rooms:lifecycle` pass with every guard-off breaking its rule.

To see what changed since the sync commit:

```sh
git log --oneline <sync commit>..HEAD -- apps/rooms/src apps/web/src/components/room-lobby.tsx apps/web/src/components/room-url.ts apps/web/src/components/screens/rejoin.tsx apps/web/src/components/guest-name.ts apps/web/src/room-handoff.ts apps/web/src/prepare-outcome.ts packages/sim/src/room.ts
```

Use `/maintain-formal-verification-skill` to bring the spec back in line after changes that skipped this skill.

Sync commit: `29ecec76` (2026-11-08). Known defects open at that commit: `lateQuitRejoins`, owned by the Multiplayer core lane.
