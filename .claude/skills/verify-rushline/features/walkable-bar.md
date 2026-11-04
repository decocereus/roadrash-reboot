# Walkable bar

The bar is the lobby the player walks around before a race. It runs live in the game's renderer with the real riders and bikes: a neon room with a back bar, a garage bay under the mezzanine, a hero bike on a turntable, seven stand-in riders with names over their heads, and a door counting down to the next race. It is reached only by a development URL, and no menu leads to it yet.

## Sub-features

- `walk`: keys and click to move, with a route around furniture. Shift runs.
- `camera`: the Angled, Follow and Whole room buttons, the `C` key, and the choice saved in the browser.
- `near`: `E` greets a near rider or sits on a near stool, `F` shoves, `1` `2` `3` hold a pose.
- `bike`: the hidden bike. `E` at the beer taps from behind the bar unlocks it, then `B` hops on and off and `R` revs.
- `door`: the countdown, the door rising, the hero bike riding out and everyone gathering, then the scene loops.
- `clock`: the dusk-to-night cycle, the skyline, the rain and the neon.

## How to get to it (user POV)

- Development build only: open `/bar`.
- Add `?time=dusk`, `?time=night` or `?time=0.5` to hold the clock, `?lean` for the Intel settings, `?ratio=<n>`, `?samples=<n>`, `?bloom=<n>` and `?shadow=<n>` to pin one setting, `?riders=<n>` to draw fewer riders.

## Driving it with rv

Preconditions: a slot from `rv up` on a development build.

- See the room: `rv open --run <run> "/bar?prof&time=dusk"`, then `rv shot --run <run> bar-dusk`. You stand in front of the plinth with `YOU` over your head, and the door countdown is in frame.
- Walk with keys: `rv press --run <run> KeyW --hold 1000`, then `rv js --run <run> 'JSON.stringify(__rushlineBar.player())'`. `z` falls and the rider is back on `foot` with no target. Watch the legs with `rv screencast --run <run> walk --seconds 3 --every 4` during a press.
- Walk by click: `rv js --run <run> 'void __rushlineBar.walkTo(-8, -1)'`, then `rv wait --run <run> '__rushlineBar.player().target === null'`. The rider walks around the plinth and ends near that spot.
- Find the bike: `rv js --run <run> 'void __rushlineBar.walkTo(-3.75, -5)'` and wait as above. The rider goes through the gap past the counter's left end and behind the bar. `rv press --run <run> KeyE --hold 80` shows the bubble and `bikeFound` turns true. `rv press --run <run> KeyB --hold 80` puts them on the bike with puffs. Hold `KeyW` and `KeyA` to see the lean.
- Change camera: `rv press --run <run> KeyC --hold 80`. The button changes, and `rushline.bar-camera` in local storage holds the choice after a reload.
- Open the door: `rv js --run <run> '__rushlineBar.openDoor()'`, then `rv screencast --run <run> door --seconds 11 --every 12`. The door lifts, the hero bike rides out, the riders gather, and you walk to the door.
- Count the frame: `rv js --run <run> '__rushlineBar.triangles()'` and `rv js --run <run> '__rushlineBar.calls()'` read one frame's totals. `rv sample --run <run> bar --seconds 20` reads the frame times.

## Gotchas

- `?time` holds the clock until the page reloads.
- The countdown opens the door by itself after 90 s and the scene loops 15 s later, so open a fresh page before a timed sample.
- The bike unlock lasts until the page reloads.
- Riders are full detail until the rendering lane ships detail levels, so the triangle count is the worst case.
