# Player events

The game sends a short list of events about where players stop, under a random ID kept on the device. `docs/observability.md` has the list and the rules. The notice appears once on the first menu, `/privacy` has the detail, and Settings has the Race data switch and shows the ID.

## Sub-features

- `events`: the eleven events, sent in batches by `navigator.sendBeacon` to `POST /api/events`, which forwards them to PostHog.
- `notice`: small and quiet above the menu strip, gone after Got it or the first race.
- `privacy`: `/privacy`, linked from the notice and Settings.
- `race-data-switch`: Settings > Race data. Off means no more beacons.
- `dropped-calls`: a failed send never affects a race.

## How to get to it (user POV)

Open the game in a fresh profile. The notice sits above the menu strip on the bar. Back room > Settings shows Race data and, when it is focused, the ID.

## Driving it

The route needs a Worker, so `vite preview` answers 500. Start the stack with `alchemy dev`, passing `POSTHOG_PROJECT_KEY` to reach PostHog or leaving it out to get a 503 from the route. Both are correct for a player: the race is the same.

- **Sending.** In a fresh browser, watch `/api/events` requests while you open the game, ride a race and finish it. Expect 202 from the route, batches about 5 seconds apart at most, and `game_opened`, `game_ready`, `race_picked`, `race_loaded`, `race_started`, `race_ended`. No request carries a name.
- **Dropped calls.** Run the same race with no key, so every beacon answers 503. The race finishes the same way and the console has no error from the sender.
- **Switch.** Turn Race data off in Settings and ride. No `/api/events` request leaves.
- **Live events.** In PostHog's activity view for the project, the events appear with no person profile.

## Gotchas

The route uses `cloudflare:workers`, so it cannot run under plain `vite preview`. A beacon's response is not readable by the page, so read the request in DevTools or the Worker's log, not from the sender.

Helium, which `rv` drives, blocks beacons to `/api/events` with `ERR_BLOCKED_BY_CLIENT`, while `sendBeacon` still returns true. That makes it a real dropped-call test: ride a race and it must finish normally. To see events land, use the T3 browser, which does not block them, or replace `navigator.sendBeacon` in the page with a `fetch` and say so. A room join reloads the page, so a replacement has to be installed again after it.
