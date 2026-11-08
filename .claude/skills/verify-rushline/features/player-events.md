# Player events

The game sends a short list of events about where players stop, under a random ID kept on the device. `docs/observability.md` has the list and the rules. The notice appears on the first menu until Got it, `/privacy` has the detail, and Settings has the Race data switch and shows the ID.

## Sub-features

- `events`: the twelve events, sent in batches by `navigator.sendBeacon` to `POST /api/events`, which forwards them to PostHog.
- `notice`: small and quiet at the bottom left of the first menu, gone only after Got it. It hides during the door moment and the race, then comes back.
- `privacy`: `/privacy`, linked from the notice and Settings.
- `race-data-switch`: Settings > Race data. Off sends what the game already holds, then no more beacons, in every open tab.
- `dropped-calls`: a failed send never affects a race.

## How to get to it (user POV)

Open the game in a fresh profile. The notice sits at the bottom left of the bar with Privacy and Got it. Back room > Settings shows Race data and, when it is focused, the ID.

## Driving it with rv

Preconditions:

- `rv doctor --run <run>` passes.
- A fresh profile, so the notice shows and Race data is On.
- `rv` serves `vite preview`, where `/api/events` answers 500, and Helium blocks the beacon anyway. So these recipes read what the page sends, not what lands. To see the route answer 202, or 503 with no key, run the stack with `alchemy dev` and passing or leaving out `POSTHOG_PROJECT_KEY`, then use the T3 browser.

- **Capture.** Run `rv open --run <run> / --until bar`, then `rv js --run <run> 'globalThis.__sent = []; const send = navigator.sendBeacon.bind(navigator); navigator.sendBeacon = (url, body) => { if (String(url).endsWith("/api/events")) body.text().then((text) => globalThis.__sent.push(text)); return send(url, body); }; localStorage.getItem("rushline.player.v1")'`. It returns the player ID. Every later beacon to `/api/events` lands in `__sent`.
- **Notice.** Run `rv js --run <run> 'document.querySelector("[aria-label=\"Race data notice\"]")?.innerText'`. It reads the notice with `PRIVACY` and `GOT IT`. Ride a race and come back: it is still there until `rv click --run <run> "Got it"`.
- **Race data and the ID.** Run `rv click --run <run> "Back room" --within Clubhouse`, `rv click --run <run> Settings --within "Back room"`, `rv press --run <run> ArrowDown`, `rv press --run <run> ArrowDown` and `rv shot --run <run> race-data`. `RACE DATA` is focused and the strip reads `Sends race and game events under your ID <id>`, the ID from Capture.
- **Sending.** Close Settings, then `rv click --run <run> "Single race" --within "Back room"`, `rv click --run <run> Race --within "Route board"`, `rv wait --run <run> race`, pause and quit with `rv press --run <run> Escape`, `rv click --run <run> "Quit race" --within Pause` and `rv click --run <run> Quit --within "Quit race"`. Then `rv wait --run <run> 'globalThis.__sent.length > 0' --timeout 15` and `rv js --run <run> 'globalThis.__sent.map((text) => JSON.parse(text).events.map((each) => each.event.event))'`. It lists `race_picked`, `race_loaded`, `race_started` and `race_ended`, in batches at most 5 seconds apart. `rv js --run <run> 'globalThis.__sent.some((text) => /name/i.test(text))'` is `false`.
- **Dropped calls.** Run `rv console --run <run> errors` after the race. Every beacon failed, the race quit normally, and no error comes from the sender.
- **Switch.** Open Settings again and run `rv click --run <run> "Race data" --within Settings` so it reads `OFF`. One last beacon may leave at the switch, carrying the events from before it. Wait a second, run `rv js --run <run> 'globalThis.__sent.length'` and note it. Close Settings, ride and quit a single race again. `rv js --run <run> 'new Promise((done) => setTimeout(() => done(globalThis.__sent.length), 8000))'` prints the same count. With a second tab open, turning it off in one tab stops the other the same way.
- **Graphics lost.** In the bar or a race, run `rv js --run <run> 'globalThis.__lose = document.querySelector("canvas").getContext("webgl2").getExtension("WEBGL_lose_context"); globalThis.__lose.loseContext()'`, using the canvas on top for the bar. Run `rv js --run <run> 'globalThis.__lose.restoreContext()'` and check with `rv shot` that the picture comes back. Within 5 seconds `__sent` holds `graphics_lost` with `where` `bar`, `race` or `menu` and `recovered` `yes`. Leave it lost for 30 seconds, or close the page, for `no`.
- **Live events.** Only with `alchemy dev` and a key: in PostHog's activity view for the project, the events appear with no person profile.

## Gotchas

- The route uses `cloudflare:workers`, so it cannot run under plain `vite preview`. A beacon's response is not readable by the page, so read the request, not the sender's return value.
- Helium, which `rv` drives, blocks beacons to `/api/events` with `ERR_BLOCKED_BY_CLIENT`, while `sendBeacon` still returns true. `rv doctor` and `rv console` treat that line as known noise.
- The `sendBeacon` replacement is gone after any reload, and a room join reloads the page. Install it again after `--until bar`.
- `game_opened` and `game_ready` flush 5 seconds after load, usually before the replacement is in. Check them under `alchemy dev` in the T3 browser.
- `race_picked` fires only from the menus. A `?ride=` or `?stress` race never sends it.
- `game_opened` is queued at load only when Race data is On, so switching Off later cannot take it back.
- Settings opens on Frame rate. Race data is two rows down; `?tester` adds recorder rows under it.
