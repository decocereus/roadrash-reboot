# Walkable bar

The bar is the lobby the player walks around before a race. It runs live in the game's renderer with the real riders and bikes: a neon room with a back bar, a garage bay under the mezzanine, a hero bike on a turntable, riders with names over their heads, and a door counting down to the next race. It is the lobby of every race room, public and custom, in production. Only the `/bar` route, which opens it with no room and seven stand-in riders, is development-only.

## Sub-features

- `walk`: keys and click to move, with a route around furniture. Shift runs.
- `camera`: the Angled, Follow and Whole room buttons, the `C` key, and the choice saved in the browser.
- `near`: `E` greets a rider within reach, sits on a near stool when nobody is, and stands up from a stool. `F` shoves. `1` `2` `3` hold a pose, and a second press of the same key drops it.
- `bike`: the hidden bike. `E` at the beer taps from behind the bar unlocks it, then `B` hops on and off and `R` revs.
- `door`: the countdown, the door rising, the hero bike riding out and everyone gathering, then the scene loops.
- `clock`: the dusk-to-night cycle, the skyline, the rain and the neon.
- `room`: real members of a race room walking the bar together, with their names and matching outfits. The stand-ins leave the floor, and a member who readies up reads `<name> READY`, or `YOU READY` over your own head. Walks, greets, shoves and someone leaving reach every browser.
- `pre-race`: a real lobby in the bar. `Enter` readies up, the server starts the race, the door lifts, the riders gather, and the countdown cuts to the race.
- `panel`: the lobby panel over the bar: members, rules, Ready, Copy the link in a custom room, Change name, Leave. Leave returns to the Clubhouse in the same page, with no loading screen. The host picks the rules behind `You set the rules`. A public lobby has no host, no picker and no link.

## How to get to it (user POV)

- Any race room: `Race friends` or `Find a race` in the Clubhouse menu lands in it, after the name screen if no name is stored. `/?room=<8 character id>` in two browsers asks for a name and shows the invite first. Add `&via=made` to skip the invite.
- Development build with no room: open `/bar`.
- Add `?time=dusk`, `?time=night` or `?time=0.5` to hold the clock, `?lean` for the Intel settings, `?ratio=<n>`, `?samples=<n>`, `?bloom=<n>` and `?shadow=<n>` to pin one setting, `?riders=<n>` to draw fewer riders.

## Driving it with rv

Preconditions: a slot from `rv up` on a development build.

- See the room: `rv open --run <run> "/bar?prof&time=dusk"`, then `rv shot --run <run> bar-dusk`. You stand in front of the plinth with `YOU` over your head, and the door countdown is in frame.
- Walk with keys: `rv press --run <run> KeyW --hold 1000`, then `rv js --run <run> 'JSON.stringify(__rushlineBar.player())'`. `z` falls, `place` reads `{"kind":"foot","pose":null}` and `target` is `null`. Watch the legs with `rv screencast --run <run> walk --seconds 3 --every 4` during a press.
- Walk by click: `rv js --run <run> 'void __rushlineBar.walkTo(-8, -1)'`, then `rv wait --run <run> '__rushlineBar.player().target === null'`. The rider walks around the plinth and ends near that spot.
- Find the bike: `rv js --run <run> 'void __rushlineBar.walkTo(-3.75, -5)'` and wait as above. The rider goes through the gap past the counter's left end and behind the bar. `rv press --run <run> KeyE --hold 80` shows the bubble and `bikeFound` turns true. `rv press --run <run> KeyB --hold 80` puts them on the bike with puffs. Hold `KeyW` and `KeyA` to see the lean.
- Change camera: `rv press --run <run> KeyC --hold 80`. The button changes, and `rushline.bar-camera` in local storage holds the choice after a reload.
- Open the door in the no-room scene: `rv js --run <run> '__rushlineBar.openDoor()'`, then `rv screencast --run <run> door --seconds 11 --every 12`. The door lifts, the hero bike rides out, the riders gather, and you walk to the door.
- Count the frame: `rv js --run <run> '__rushlineBar.triangles()'` and `rv js --run <run> '__rushlineBar.calls()'` read one frame's totals. `rv sample --run <run> bar --seconds 20` reads the frame times.
- Budget: `pnpm perf:gpu` holds the bar to its `bar.frame.*` and `bar.render.*` rows in `tools/perf/budgets.json`. Run it after a change to what the bar draws. A `FAIL bar` line names the window and what was wrong with it.
- Walk a room with two browsers: start the Worker with `RUSHLINE_WEB_PORT=1436 RUSHLINE_ROOMS_PORT=1437 pnpm exec alchemy dev --stage barriders` and leave it running. In each Bash call that starts a run, `export VITE_ROOMS_URL=http://127.0.0.1:1437`, set `rushline.guestName.v1` in each browser's local storage, then open `/?room=abcd2345&via=made&time=dusk` in both. Each gets its own slot and `curl http://127.0.0.1:1437/rooms/abcd2345` lists the room. Walk A with `walkTo` to a spot beside B and watch B's screen with `rv screencast --run <b> walkin --seconds 3 --every 6`. A's figure walks with its legs moving, under A's name, in the outfit A sees on its own screen. `KeyF` on A moves B's rider in B's `__rushlineBar.player()`. `KeyE` shows YO over A and SUP over B on both screens. `rv down` on A takes A's figure out of B's room.
- Read what each colour is doing: in a room, `rv js --run <b> 'JSON.stringify(__rushlineBar.presence().map(({ memberId, phase, shoving }) => ({ memberId, phase, shoving })))'` lists one state per colour. A colour with nobody in it, and this rider's own colour, read `vacant`. A member the seat has heard reads `following`, and during the door moment `leaving`. A shove shows as `shoving` counting down from 18.
- Play the pre-race moment: with the same room, `rv press --run <run> Enter --hold 80` on each. Record with `rv screencast --run <run> door --seconds 7 --every 10`. The panel disappears, the plate reads 0:00, the door lifts, the camera pushes in, and the other rider walks to the door. About 5 seconds later the race shows its countdown.
- Prove it on the live site: `rv open` takes only this run's paths, so `rv up --dev --path /privacy`, then `rv js --run <run> 'void (location.href="https://rushline.amartya-faceless.workers.dev/privacy")'`, and set `rushline.guestName.v1` there, because local storage is per origin. Go to `/` and press `Find a race` in two windows. Both land in one public lobby within about 34 s. `&autopilot` does nothing on production, so an idle race runs to the room's race limit, 6:00 by default. Then `Back to the lobby` returns to the bar with a road the server picked and a new 45 s timer. Hold other lanes' merges for it, because a deploy resets the room.

## Gotchas

- `?time` holds the clock until the page reloads.
- First-time browsers show the data notice over the left of the room until `Got it`. It hides during the door moment and comes back afterwards, still not dismissed.
- The countdown opens the door by itself after 90 s and the scene loops 15 s later, so open a fresh page before a timed sample.
- The bike unlock lasts until the page reloads.
- The first `rv up --dev` after new imports can hit Vite's `504 Outdated Optimize Dep`, and the page never reaches the bar. Open the page again.
- A development build opens a throwaway room socket when React mounts twice. About 1 join in 11 against the live rooms server ended on "You opened this lobby in another tab", probably because the throwaway socket reached the server second. Reload the page. Production builds mount once.
- Riders are full detail until the rendering lane ships detail levels, so the triangle count is the worst case.
