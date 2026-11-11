# Player events

The game sends a short list of events about where players stop, under a random ID kept on the device. `docs/observability.md` has the list and the rules. The notice is on the first-visit card, which shows once until Walk in, `/privacy` has the detail, and Settings has the Race data switch and shows the ID.

## Sub-features

- `events`: the twelve events, sent in batches by `navigator.sendBeacon` to `POST /api/events`, which forwards them to PostHog.
- `notice`: on the first-visit card with the name field, Walk in and Privacy, shown once over the dimmed bar until Walk in. It never sits in a corner of the bar.
- `privacy`: `/privacy`, linked from the first-visit card and Settings.
- `race-data-switch`: Settings > Race data. Off sends what the game already holds, then no more beacons, in every open tab.
- `dropped-calls`: a failed send never affects a race.

## How to get to it (user POV)

Open the game in a fresh profile. The first-visit card asks for a name, carries the notice with Privacy, and Walk in closes it for good. The Settings tab shows Race data and, under `?tester`, the ID.

## Driving it with rv

Preconditions:

- `rv doctor --run <run>` passes.
- A fresh profile, so the first-visit card shows and Race data is On.
- `rv` serves `vite preview`, where `/api/events` answers 500, and Helium blocks the beacon anyway. So these recipes read what the page sends, not what lands. To see the route answer 202, or 503 with no key, run the stack with `alchemy dev` and passing or leaving out `POSTHOG_PROJECT_KEY`, then use the T3 browser.

- **Capture.** Run `rv open --run <run> / --until bar`, then `rv js --run <run> 'globalThis.__sent = []; const send = navigator.sendBeacon.bind(navigator); navigator.sendBeacon = (url, body) => { if (String(url).endsWith("/api/events")) body.text().then((text) => globalThis.__sent.push(text)); return send(url, body); }; localStorage.getItem("rushline.player.v1")'`. It returns the player ID. Every later beacon to `/api/events` lands in `__sent`.
- **Notice.** Run `rv js --run <run> 'document.querySelector("[role=dialog][aria-label=\"First visit\"]")?.innerText'`. It reads the name question, the notice, `WALK IN` and `PRIVACY`. Reload: it is still there. `rv press --run <run> KeyR` and `rv click --run <run> "Walk in"` close it, and `JSON.parse(localStorage.getItem("rushline.settings.v1")).noticeSeen` is `true`; reload and the bar opens with no card.
- **Race data and the ID.** Open the page with `&tester`, run `rv click --run <run> Settings --within "The bar"` and `rv shot --run <run> race-data`. `radiogroup "Race data"` has `On` checked, and the ID line under the tester rows reads the ID from Capture.
- **Sending.** `rv click --run <run> Race --within "The bar"`, `rv click --run <run> "Ride solo" --within Race`, `rv click --run <run> Race --within "Ride solo"`, `rv wait --run <run> race`, pause and quit with `rv press --run <run> Escape`, `rv click --run <run> "Quit race" --within "Race menu"` and `rv click --run <run> Quit --within "Quit race"`. Then `rv wait --run <run> 'globalThis.__sent.length > 0' --timeout 15` and `rv js --run <run> 'globalThis.__sent.map((text) => JSON.parse(text).events.map((each) => each.event.event))'`. It lists `race_picked`, `race_loaded`, `race_started` and `race_ended`, in batches at most 5 seconds apart. `rv js --run <run> 'globalThis.__sent.some((text) => /name/i.test(text))'` is `false`.
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
