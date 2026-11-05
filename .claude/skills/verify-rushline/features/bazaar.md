# Market bazaar

Breakwater Run's market squeeze, 1,300 to 1,740 m, has stalls down both footpaths with people serving, haggling and browsing at them. The road keeps its width and a strip runs between the kerb and the stalls. A fast rider who runs wide into a stall crashes, a slow one bumps it and rides off, and the camera never ends up inside one.

## Sub-features

- `bazaar-look` draws stalls and decorations on both footpaths of the squeeze, facing the road, standing on the footpath.
- `bazaar-crowd` stands people at every third stall, playing `serve`, `haggle` and `browse` without a pop at the loop, facing the right way.
- `bazaar-fast-hit` crashes a rider who runs wide into a stall above 50 km/h.
- `bazaar-slow-touch` drops a rider who touches a stall at 50 km/h or less to walking pace, without a crash, and lets them ride off.
- `bazaar-gaps` leaves a 3 m gap in both rows wherever walkers cross, with no crate in it, so a walker at the kerb has a way in from the footpath.
- `bazaar-remount` stops a thrown rider's bike and body at the row, so the rider gets back on in front of it and rides back to the road.
- `bazaar-clear` hides the one stall the camera reaches and puts it back when the camera has passed, and hides none while the rider stays on the road or the strip.
- `bazaar-frame` holds the frame budget through the squeeze with the crowd in view.

## How to get to it (user POV)

- Ride Breakwater Run from any race or room. The market starts 1,300 m after the start line.
- Run wide across the strip into a stall, at speed and slowly.

## Driving it with rv

Preconditions:

- `rv doctor --run <run>` passes on a development build (the flags below are DEV only).
- Frame numbers and the look go on `vimaan`, as `AGENTS.md` says. Compare frame numbers only within one machine.

- **Riding through (`bazaar-look`, `bazaar-crowd`, `bazaar-clear`).** Run `rv open --run <run> "/?ride=breakwater-run&at=1280&kmh=90&autopilot&clear&hold=at&holdafter=1500&prof" --until race`, `rv wait --run <run> held --timeout 90`, `rv shot --run <run> bazaar-lane`. Stalls stand on both footpaths, signs face the road, and people stand behind counters and in front of stalls with no gap to the ground. No stall is missing beside the road.
- **Watching the crowd (`bazaar-crowd`).** Run `rv open --run <run> "/?ride=breakwater-run&at=1280&kmh=40&autopilot&clear&prof" --until race` and at once `rv screencast --run <run> bazaar-crowd --seconds 10`. Look through the frames. Every person keeps moving, with no jump where a clip loops and no foot off the footpath.
- **Fast hit (`bazaar-fast-hit`).** Run `rv open --run <run> "/?ride=breakwater-run&at=1480&kmh=130&straight&clear&swerve=1480&swervefor=200&swerveto=1&hold=crash&holdafter=20&prof" --until race`, `rv wait --run <run> held --timeout 90`, `rv shot --run <run> bazaar-crash`, and read `__rushlineHeld`. The rider is thrown beside a stall, the cause is a prop, and the stall that was hit is drawn whole once the camera has passed.
- **Slow touch (`bazaar-slow-touch`).** Run `rv open --run <run> "/?ride=breakwater-run&at=1480&kmh=40&straight&clear&swerve=1480&swervefor=400&swerveto=1&hold=at&holdafter=1540&prof" --until race`, `rv wait --run <run> held --timeout 90`, `rv shot --run <run> bazaar-touch`. The speed meter reads about walking pace for a moment, the rider stays on the bike beside the stall, and no crash event appears.
- **Walkers in the gaps (`bazaar-gaps`).** Run `rv open --run <run> "/?ride=breakwater-run&at=1280&kmh=40&autopilot&prof" --until race`, with no `clear` so the walkers are out, and `rv screencast --run <run> bazaar-gaps --seconds 15`. Walkers wait at the kerb and cross where both rows have a gap. None stands in front of a counter waiting to cross, and none walks through a stall. The stations are `track.walkSites`, and 12 of them fall in the market.
- **Thrown beside the row (`bazaar-remount`).** Run the fast hit without `hold=crash`, hold the remount key, and take `rv screencast --run <run> bazaar-remount --seconds 8`. The bike and the body stop at the stall and do not slide through it. The rider gets back on in front of the row, rides back to the road, and is not thrown a second time.
- **Camera behind the row (`bazaar-clear`).** Swerve wide at speed with `kmh=30` and `swerveto=1`, then watch a screencast. The stall the camera enters is gone while it is inside and back once it has passed. No other stall flickers.
- **Frame cost (`bazaar-frame`).** On `vimaan`, run `pnpm perf:gpu` before and after, and `rv open --run <run> "/?ride=breakwater-run&at=1250&kmh=100&autopilot&clear&prof" --until race` to read the frame profile through the squeeze. The crowd draws in the main, normal and shadow passes, so it costs far more than the stalls.

## Gotchas

- The `clear` flag empties the road, which is what these recipes want. Remove it to see the stalls with the traffic and the field.
- A rider threading a gap passes through decorations. That is not a defect in this feature. A rider running for their own bike also passes through a stall, because a bike can come to rest behind the row. Any other rider, bike or body inside a stall's footprint for more than a moment is a defect.
- `packages/sim/src/stalls.test.ts` and `apps/web/test/bazaar.test.ts` prove the rule and the clearance. They do not show how it looks.
