# Jumps

Every road has steel ramps on the right of the centre line. A lit diamond sign 150 m before the toe, two striped posts with amber lamps, and yellow chevrons on the road count down to each one. A rider who lines up and hits the ramp at speed leaves the ground, flies, and lands further on with a puff of road-coloured dust; a hard landing adds sparks.

## Sub-features

- `ramp-look` shows the ramp structure, sign, lamp posts, and chevrons on approach.
- `ramp-launch` lifts the bike off the lip into the air.
- `ramp-air` keeps the rider airborne for a moment with the camera following.
- `ramp-landing` sets the bike down and keeps riding, with soft dust that clears in half a second.
- `ramp-hard-landing` adds bright spark streaks on a heavy landing.
- `ramp-miss` lets a rider who is not lined up ride past beside the ramp.

## How to get to it (user POV)

- Ride any road past a ramp: Breakwater Run 4.05 and 5.42 km, Cinder Wash 4.25 and 5.30 km, Hollow Pine Road 3.33 and 7.76 km, Slag Row 4.72 and 7.28 km (and 10.88 km from level 4), Ridge Road 8.29 km.
- Steer onto the ramp's lane, right of the centre line, and keep the throttle open.

## Driving it with rv

Preconditions:

- `rv doctor --run <run>` passes on a development build (the flags below are DEV only).

- **Approach.** Start 350 m before Breakwater Run's first ramp (toe at 4,050 m, lip at 4,066 m) with the pilot riding, and freeze 130 m before the toe. Run `rv open --run <run> "/?ride=breakwater-run&at=3700&autopilot&prof&hold=at&holdafter=3920" --until race`, `rv wait --run <run> held --timeout 90`, `rv shot --run <run> ramp-approach`. The ramp, its lamp posts, and the chevrons should be in front of the bike; see Gotchas for what the October 16 run showed.
- **Air.** Run `rv open --run <run> "/?ride=breakwater-run&at=3700&autopilot&prof&hold=air&holdafter=20" --until race`, `rv wait --run <run> held --timeout 90`, `rv js --run <run> '({ tick: globalThis.__rushlineProfile.info().tick, speed: document.querySelector("[role=meter][aria-label=Speed]").getAttribute("aria-valuenow") })'`, `rv shot --run <run> ramp-air`. `__rushlineHeld` is true a third of a second into the air, at about tick 643, and the speed reads 208 km/h. The frame should show the bike in the air where the chase camera usually frames it; see Gotchas.
- **Landing.** Run `rv js --run <run> 'globalThis.__rushlineRelease()'` and at once `rv screencast --run <run> ramp-landing --seconds 3`. The frames show the bike coming down, dust in the road's colour, and the dust gone within half a second. About 180 frames over 3 seconds; look at several, not just the first.
- **Landing moment.** Run `rv open --run <run> "/?ride=breakwater-run&at=3700&autopilot&prof&hold=land&holdafter=2" --until race`, `rv wait --run <run> held --timeout 90`, `rv shot --run <run> ramp-land`. The frozen frame shows the bike back on the road at about 200 km/h with a pale dust puff and yellow spark streaks at the rear wheel.
- **Every road.** Repeat Air with `ride=` and `at=` about 350 m before each ramp listed above, for example `ride=slag-row&at=6930` for the 7.28 km ramp. The 10.88 km ramp is only on level-4 roads, so `ride=slag-row&level=4&at=10530` reaches it only when `apps/web/src/server/race-rules.ts` serves four or more levels.

## Gotchas

- `?hold=air` counts ticks airborne and fires once per page; `holdafter=20` is a third of a second.
- With `?autopilot` the pilot chooses whether to take the ramp, and a pilot that misreads a ramp rides past it. If `held` never comes, take the screenshot anyway and check where the bike went; to force the line, drop `?autopilot` and ride with the keyboard, or with `&straight&swerve=<metres>&swerveto=<steer>` before the ramp.
- `?at` skips the approach, so the race clock starts near the ramp with the pack far behind.
- Open findings from October 16, 2026 at `646f678`, with and without `?at`: the approach frame at 3,920 m showed no ramp, lamp posts, sign, or chevrons in front of the bike, although the bike launched and landed with dust and sparks; and in the held air frame and the first half second of the landing screencast the airborne bike is small and far ahead of the chase camera, which catches up to its usual framing about a second after touchdown. Look at both screenshots before calling ramps or the camera right.
- Screencast frames show motion; use `rv sample` with `&prof` for frame times.
