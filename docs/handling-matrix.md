# Handling matrix

`BikeSpec` in `packages/sim/src/state.ts` holds the numbers that make one bike handle differently from another. This page lists each field: what it means, the unit or convention it uses, the code that reads it, what a player feels, and the test that pins that feel through `createRace` and `stepRace`. Use it in review to decide whether a new number belongs in `BikeSpec` or in the shared model. No lint rule can make that call, so the coding standard's `BikeSpec` row stays `judgment`.

The bikes themselves are in `packages/sim/src/bikes.ts`. This page does not repeat their numbers.

## Fields

| Field | Meaning and unit | Read by | What the player feels | Pinned by |
| --- | --- | --- | --- | --- |
| `id`, `name`, `bikeClass`, `price` | Catalogue identity, class and price. Not handling. | `bikes.ts`, the career shop and field draw | Which bike it is and what it costs | The career shop and field tests in `packages/career` |
| `launchAcceleration` | The most acceleration the rear tyre puts down, in m/s² at full throttle and full load. It caps the engine's pull | `engine.ts` and `rider-drive.ts` | How hard the bike leaves the line | `riding.test.ts`: "the Sesta reaches 100 km/h in about three and a half seconds", "the starter bike reaches 100 km/h in under four seconds" |
| `powerPerMass` | Engine power per kilogram. `engine.ts` divides it by the gear's top speed and shapes it with the shared torque curve and `POWER_NORM` to give the pull in m/s² | `engine.ts` | How the bike keeps pulling at speed, and its top speed with drag | `riding.test.ts`, same two tests; `engine-and-tuck.test.ts`: "in a gear the bike pulls hardest in the middle of the rev range" |
| `gears` | Top speed of each gear in m/s; the length is the number of gears | `engine.ts` | When it shifts and the lull at each upshift | `engine-and-tuck.test.ts`: "the starter bike climbs through all six gears on a straight" |
| `dragFactor` | Air drag: `dragFactor` × speed² is the deceleration in m/s², so the unit is 1/m. Tucking in cuts it by the shared `TUCK_DRAG_CUT` | `engine.ts` | Top speed, and how much tucking in gains | `engine-and-tuck.test.ts`: "a rider who holds the throttle and sits still tucks in"; `braking-and-cornering.test.ts`: "every Heavyweight is faster flat out than the Sesta" |
| `rollingDeceleration` | Constant deceleration in m/s² from tyres and road | `engine.ts` | How the bike coasts | `riding.test.ts`: "the starter bike rolls off the throttle" |
| `engineBraking` | Deceleration in m/s² with the throttle shut, scaled by revs | `rider-drive.ts` | How much a lift slows the bike before the brakes | `riding.test.ts`: "the starter bike rolls off the throttle"; `engine-and-tuck.test.ts`: "a hard brake sits the rider up within a third of a second" |
| `brakeDeceleration` | Full-brake deceleration in m/s², weakened by the shared rules for load, lean, the verge and slip | `rider-drive.ts` | Stopping distance | `riding.test.ts`: "the brakes take a fifth of a second to bite", "stops from 200 km/h in about 55 metres", "the brakes still bite in the tightest bend" |
| `lateralSpeed`, `lateralSpeedPerSpeed` | Sideways speed at full lock in m/s: a base plus a share of forward speed, faded out at walking pace | `state.ts` (`lateralSpeedLimit`; `lateralFor` caps the settled lean at 40% of it and spreads the steer from there to each lock, and `steerFor` inverts that), the rider step, the pilot and the chevron audit in `corner-warnings.ts` | How far the bike moves across the road at full lock | `riding.test.ts`: "the bars take most of a second to reach full lock", "the bike carries on sideways for most of a second after the key lifts", "in a bend of curvature %d at 144 km/h, full lock at %d still reaches the bike's whole sideways speed" |
| `steerRate` | How fast sideways speed moves toward what the bars ask for, in m/s², scaled by the weapon carried and by grip | `rider-drive.ts` | How quickly the bike answers the bars | `braking-and-cornering.test.ts`: "the Gutter Pup answers the bars more slowly than any other bike, and the Wren fastest" |
| `curvePush` | Divides the bend's push, curvature × speed²; a larger number means less push. A coefficient of the shared model, not a physical unit | `state.ts` (`curvePushOf`, and the settled lean in `lateralFor` and `steerFor`), the rider step, the pilot's corner speeds and the chevron audit in `corner-warnings.ts` | Which bends the bike takes flat out, which it follows with the bars centred, where it is pushed wide, and where the chevrons stand | `riding.test.ts`: "centred bars hold the opening bend at 144 km/h, where it asks a third of lock", "the opening bend pushes a rider who does not steer to the outside at 190 km/h, where it asks half of lock"; `madrid-hook.test.ts`: the centred-bars probe on the lake road; `corner-warnings.test.ts`: the chevron table and the brake from the first chevron; `braking-and-cornering.test.ts`: "the Wren holds the Switchback at 158 km/h where the Sesta lets go at 138", the Hermit's Bend, Dry Dock Corner and Sawmill Hook tests; `pilot-cornering.test.ts`: the long sweeper, the ramp before a bend and the downhill bend |
| `leanScrub` | Deceleration per unit of speed at full lock, in 1/s, scaled by lock squared | `rider-drive.ts` | How much speed a hard lean costs | `braking-and-cornering.test.ts`: "a heavyweight at full lock scrubs less speed and moves less sideways than a featherweight", "a Wren that holds the throttle into Hermit's Bend at 190 km/h scrubs down" |
| `visualLean` | Divides the drawn lean. Only the renderer reads it; it does not change grip | `apps/web/src/game/rider-views.ts` | How far the rider and bike lean on screen | A live steering check in the running game. No simulation test reads it, because it is not simulation state |

## What stays in the shared model

These belong to the riding model, not to a bike, and stay with their current owners:

- `SETTLED_LEAN` in `state.ts`, the share of full lock the bars settle into a bend with when they are centred
- `TAKEOFF_SPEED`, `BRAKE_RESERVE`, `SLIP_RECOVERY`, `SLIP_PUSH` and the slide thresholds in `rider-drive.ts`
- `HARD_LANDING` and `LANDING_SLIP` in `rider-flight.ts`
- the torque curve, `POWER_NORM`, the shift points and the tuck in `engine.ts`
- each weapon's steering factor in `weapons.ts`

A new number belongs in `BikeSpec` when two bikes should differ in it and a player should feel the difference. It belongs in the model when every bike should obey it the same way. If a row here has no test that observes it, add a `createRace`/`stepRace` case to the matching test file, and keep the existing numbers.
