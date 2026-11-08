# Casa de Campo hook

A greybox of the Madrid corridor's Casa de Campo hook: Paseo del Embarcadero along the lake, an S-bend by the boathouse, then Glorieta de los Patines. The player rides 1,039 metres of fitted road through grey blocks, simple trees and a flat lake. It answers one question, whether the hook rides well at speed, and it is reached only by a development URL. No menu, career race or bar screen leads to it.

## Sub-features

- `alone`: the player only, no rivals, no police, no traffic.
- `field`: the practice field at the chosen tier, no traffic.
- `traffic`: the field and the hook's traffic.
- `sbend`: the Embarcadero S-bend, 430 to 630 m, built to a 35 m radius.
- `patines`: Glorieta de los Patines, 780 to 1,020 m, a junction built to a 25 m radius that the rider slows for.
- `scenery`: world-space ground under its grass cover, 48 grey blocks from the footprints, the traced lake and trees.

## How to get to it (user POV)

Development build only: open `/?ride=madrid-hook`. Add `&bike=<bike id>` to choose the bike (default `ostra-sesta-600`, also `halden-wren-400` and the other ids in `packages/sim/src/bikes.ts`) and `&with=alone`, `&with=field` or `&with=traffic` (the default). `&tier=1`, `2` or `3` sets the field's tier; any other value rides tier 1. The production build ignores all of them.

## Driving it with rv

Preconditions: a slot from `rv up` on this checkout and a passing `rv doctor`.

- Ride alone on the Sesta: `rv open --run <run> "/?ride=madrid-hook&bike=ostra-sesta-600&with=alone&autopilot&prof&fps" --until race`, then `rv shot --run <run> hook-start`. The HUD reads 1ST of 1, the overlay holds 60 fps.
- Freeze in the S-bend: `rv open --run <run> "/?ride=madrid-hook&bike=ostra-sesta-600&with=alone&autopilot&hold=at&holdafter=532" --until held`, then `rv js --run <run> 'document.querySelector("[role=meter][aria-label=Speed]").getAttribute("aria-valuenow")'` and `rv shot --run <run> sbend`. Read the Sesta's and the Wren's speeds; the Wren is the faster of the two. The lake lies to the right.
- Freeze at Patines: the same with `holdafter=853`. Again the Wren reads faster than the Sesta.
- Ride with the field or with traffic: swap `with=alone` for `with=field` or `with=traffic`. The grid fills with rivals; traffic adds cars in both lanes.
- Measure a lap: `rv open --run <run> "/?ride=madrid-hook&bike=ostra-sesta-600&with=alone&autopilot&prof" --until race`, `rv sample --run <run> hook-lap --seconds 30`, then `rv wait --run <run> 'document.querySelector("[aria-label=Finish]") !== null' --timeout 90` for the finish. The finish menu shows no time. Compare the Helium speeds at both places with the headless pilot on the same seed, which finishes alone on the Sesta and the Wren within a second of each other.
- Measure camera steadiness without a browser: `pnpm test apps/web/test/madrid-camera.test.ts` rides the pilot on every road and both Madrid stretches, drives the real chase camera, and fails if a stretch's straights shake more than the shakiest existing road's. `docs/madrid-corridor.md` has the numbers.
- Read the fitted numbers without a browser: `pnpm madrid:stretch --id madrid-hook` regenerates `packages/track/src/tracks/madrid-hook.ts`, its scenery and its blocks module, and prints the distance from the street, the curvature and grade change sign flips per kilometre, the grade fit, the blocks kept and the lake clearance. A clean `git diff` after it proves the plan matches its inputs.

## Gotchas

- The hook borrows Slag Row's road id for the field draw, the police officer and the result, so the ride-out card and the results screen say Slag Row. The track, length and lap time are the hook's.
- Police posts start at 1,500 m, past the hook's finish at 1,039 m, so no cop rides on the hook in any mode.
- The road runs 80 m of lead-in before the hook and 200 m of runoff after it. Two potholes lie past the 450 m start clearance, one in the S-bend at 529 m and one on the Patines approach at 838 m, and tier 1 shows both.
- Tree positions are procedural, not surveyed. Blocks take the corridor's estimated heights.
- `?hold=at` freezes on the first tick past the distance, so speeds read a few km/h either side of the slowest point.
