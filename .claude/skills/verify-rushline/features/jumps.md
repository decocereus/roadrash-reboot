# Jumps

Every road with traffic and a truck in its plan has moving car carrier trucks in the first same-way lane. Each is a double-deck truck loaded with six cars, towing a ramp up the road at 72 km/h. A rider who catches one at about 128 km/h or more rides up the ramp, clears both decks, flies, and lands ahead of the truck with a puff of dust in the region's dust colour; a hard landing adds sparks, and a hop shorter than 0.2 s raises no dust. Road crests launch the bike too, under the same landing rules.

## Sub-features

- `truck-look` shows the truck, deck cars and ramp from behind and from the next lane.
- `truck-launch` lifts the bike off the lip into the air.
- `truck-air` keeps the rider airborne over the decks with the camera following.
- `truck-landing` sets the bike down ahead of the truck and keeps riding, with soft dust that clears within about 0.6 s.
- `truck-slow` crashes a rider who rides up the ramp too slowly and comes down on the truck.
- `truck-miss` lets a rider in the next lane ride past on the road.
- `truck-pilot` has a computer rider jump when it can and go round when it cannot.

## How to get to it (user POV)

- Ride a road and catch a truck. A rider at race pace meets one at about these places: Breakwater Run 7.25 and 7.89 km, Slag Row 4.72 and 7.28 km, Ridge Road 8.29 km. A faster rider meets it earlier.
- Stay in the truck's lane, the first lane right of the centre line, and keep the throttle open.

## Driving it with rv

Preconditions:

- `rv doctor --run <run>` passes on a development build (the flags below are DEV only).

- **Where trucks start.** Trucks start at Breakwater Run 3,900 and 4,650 m, Slag Row 2,600 and 4,100 m, Ridge Road 4,500 m. `?at` puts the player on the road at the race's first tick, with the truck still at its start, so `at=` 250 m short of a start reaches it within seconds. Breakwater Run's 3,900 m truck starts at the mouth of the one-lane Arcades, where the pilot slows behind it and does not jump, so these recipes use its 4,650 m truck, which the pilot jumps from 50 m behind.
- **Approach.** Run `rv open --run <run> "/?ride=breakwater-run&at=4500&kmh=180&autopilot&prof&hold=at&holdafter=4620" --until race`, `rv wait --run <run> held --timeout 90`, `rv shot --run <run> truck-approach`. The truck, its deck cars and the ramp should be ahead in the first same-way lane.
- **Air.** Run `rv open --run <run> "/?ride=breakwater-run&at=4600&kmh=180&autopilot&prof&hold=air&holdafter=20" --until race`, `rv wait --run <run> held --timeout 90`, `rv js --run <run> '({ tick: globalThis.__rushlineProfile.info().tick, speed: document.querySelector("[role=meter][aria-label=Speed]").getAttribute("aria-valuenow") })'`, `rv shot --run <run> truck-air`. The frame should show the bike above the truck.
- **Landing.** Run `rv js --run <run> 'globalThis.__rushlineRelease()'` and at once `rv screencast --run <run> truck-landing --seconds 3`. The frames show the bike coming down ahead of the truck, dust in the region's dust colour, and the dust gone within about 0.6 s. Look at several frames, not just the first.
- **Landing moment.** Run `rv open --run <run> "/?ride=breakwater-run&at=4600&kmh=180&autopilot&prof&hold=land&holdafter=2" --until race`, `rv wait --run <run> held --timeout 90`, `rv shot --run <run> truck-land`.
- **Too slow.** Run `rv open --run <run> "/?ride=breakwater-run&at=4550&kmh=100&straight&prof&hold=crash&holdafter=30" --until race` and watch it ride up the ramp and come down on the truck. `?straight` holds the player's line, so move it onto the truck's lane with `&swerve=` if `at` leaves it elsewhere.
- **Every road.** Repeat Air with `ride=` and `at=` 250 m short of each start listed above, for example `ride=slag-row&at=3850` for the 4.10 km truck.
- **The pilot's rule.** `pnpm vitest run packages/sim/src/carrier.test.ts` rides a pilot at a truck with `createRace` and `stepRace`: it jumps when it can, goes round for a car in the landing stretch and when too slow, and only an unskilled rider misjudges.

## Gotchas

- `?hold=air` counts ticks airborne and fires once per page; `holdafter=20` is a third of a second.
- With `?autopilot` the pilot chooses whether to take the truck. If it goes round, `held` never comes. Take the screenshot anyway and check where the bike went. To force the line, drop `?autopilot` and ride with the keyboard, or with `&straight&swerve=<metres>&swerveto=<steer>`.
- A truck launch on flat road lands at about 11 m/s, just inside the hard-landing limit, so a player who launches where the road is about to rise can crash on landing. The pilot forecasts that and goes round.
- `?at` skips the approach, so the race clock starts near the truck with the pack far behind.
- Screencast frames show motion; use `rv sample` with `&prof` for frame times.
