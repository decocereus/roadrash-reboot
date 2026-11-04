# Bar look test

The bar runs live in the game's renderer with the real riders and bikes: a neon room with a back bar, a garage bay under the mezzanine with its own bike and rider, and a hero bike on a turntable, eight riders in big colour blocks with their names over their heads, and a door counting down to the next race. It answers whether the concept art survives in the real game. It is reached only by a development URL, and no menu leads to it.

## Sub-features

- `room`: the room, its windows, signs and floor light.
- `clock`: the dusk-to-night cycle, the skyline, the rain and the neon.
- `cast`: eight posed riders, one walking the floor, with name tags and speech bubbles.
- `door`: the countdown, the door rising, the hero bike riding out and the riders gathering.
- `rev`: the hero bike's engine and the neon pulse.
- `garage`: the garage camera shot.

## How to get to it (user POV)

- Development build only: open `/bar`. Click a rider to push in on them, press `KeyR` to rev, `KeyT` to move the clock, `KeyG` for the garage shot, `Space` to open the door.
- Add `?time=dusk`, `?time=night` or `?time=0.5` to hold the clock, `?lean` for the Intel settings, `?ratio=<n>`, `?samples=<n>`, `?bloom=<n>` and `?shadow=<n>` to pin one setting, `?riders=<n>` to draw fewer riders.

## Driving it with rv

Preconditions: a slot from `rv up` on a development build.

- See the room: `rv open --run <run> "/bar?prof&time=dusk"`, then `rv shot --run <run> bar-dusk`. The sign, the back bar, the door countdown and the skyline are in frame and all eight name tags show.
- See night: `rv open --run <run> "/bar?prof&time=night"`, then `rv shot --run <run> bar-night`. The windows show a night skyline with rain.
- Count the frame: `rv js --run <run> '__rushlineBar.triangles()'` and `rv js --run <run> '__rushlineBar.calls()'` read one frame's totals. `rv sample --run <run> bar --seconds 20` reads the frame times.
- Open the door: `rv js --run <run> '__rushlineBar.openDoor()'`, then `rv screencast --run <run> door --seconds 11 --every 12`. The door lifts, the hero bike rides out down the street, and Parker and Kai walk to the door.
- Watch the walker: `rv js --run <run> '__rushlineBar.setFocus(5)'`, then `rv screencast --run <run> walk --seconds 4 --every 4`. Kai's legs alternate and he turns before he walks.
- See the garage: `rv js --run <run> '__rushlineBar.setShot("garage")'`, then `rv shot --run <run> bar-garage`.

## Gotchas

- `?time` holds the clock until the page reloads, and `T` shifts only an unheld clock.
- The countdown opens the door by itself after 40 s and the scene loops 15 s later, so open a fresh page before a timed sample.
- The race flag repeats the eight colours when more than eight riders start.
- Riders are full detail until the rendering lane ships detail levels, so the triangle count is the worst case.
