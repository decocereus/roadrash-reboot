# Ride solo and single race

The game opens in the walkable Lowside bar with the Race tab on its home panel. Ride solo there opens the Ride solo panel: the career line with Ride, and a single race, where a player picks one of three roads and presses Race. The ride-out card shows the field while the road loads, and the race starts by itself with no money at stake. During the race Escape pauses it, and the pause menu resumes, restarts, toggles sound, opens Settings, or quits back to the bar.

## Sub-features

- `ride-solo` shows `Career. Tier <n>. $<cash> in your pocket.` with Ride (`Next up, <road>.`), or New career when the career is over, Start over for a damaged save, Try again for an unreadable one, and nothing while the save loads. Under it, `Single race. Pick a road. No money on it.`, one button per road with the picked one `aria-pressed`, Race, and Back. A single race rides the career's tier and bike: after New career it reads tier 1 and the bike that career owns.
- `ride-out` shows the road's flyer, the grid, and "Loading the road", then "Ride", and starts the race about 2 seconds after it opens. It has no buttons; Escape goes back.
- `ride-out-failed-load` shows `The riders did not load.` with Retry and Back when a rider's model cannot load. Retry prepares the race again and starts it without waiting out the dwell again. A Retry before the dwell ends still waits it out. Back returns to Ride solo.
- `ride-out-back` leaves the card while the road is loading, and the preparation that finishes later starts nothing.
- `race-start` counts down 3, 2, 1, then shows the speedometer with place out of 10.
- `pause` freezes the race on Escape and offers Resume, Restart race, Sound, Settings, and Quit race. A career race drops Restart race and asks Quit and pay ([career.md](career.md)); a room race does not pause.
- `resume` holds the race for 3 seconds with countdown digits, then lets it run.
- `restart` starts the same single race again, from the pause menu or with R. Neither a career race nor a room race restarts.
- `quit` asks to confirm, then returns to the bar's home panel.

## How to get to it (user POV)

- Load the site; the bar opens on the Race tab.
- Choose Ride solo, pick a road under Single race, then Race. Escape or Back on Ride solo goes home.
- Press Escape during a race to pause; press Escape again to resume.

## Driving it with rv

Preconditions:

- `rv doctor --run <run>` passes.
- A fresh profile (no career save). The bar starts a new career on first load.

- **Ride solo.** Run `rv open --run <run> / --until bar`, `rv click --run <run> "Ride solo" --within Race` and `rv aria --run <run> ride-solo`. `region "Ride solo"` shows the career line, `button "Ride Next up, Breakwater Run."`, the three road buttons with `Ridge Road` `pressed=true`, `Race` and `BACK`.
- **Pick a road.** Run `rv click --run <run> "Slag Row" --within "Ride solo"`. `Slag Row` reads `pressed=true` and the others `pressed=false`.
- **Ride out.** Run `rv click --run <run> Race --within "Ride solo"` and `rv shot --run <run> ride-out`. The card shows the flyer and the grid with YOU last.
- **Failed load and Retry.** `?as=` works only in a development build, which is what `rv` serves. Read the model's file name from `apps/web/src/assets/art.json`, open Ride solo on `/?as=kylie`, and keep a DevTools session open on the page's port that sends `Network.enable` and `Network.setBlockedURLs` with `urlPatterns` `[{ "urlPattern": "*://*:*/art/<file name>", "block": true }]`. Run `rv click --run <run> Race --within "Ride solo"`. The card shows the alert with Retry and Back, and no speed meter appears past the dwell. `rv click --run <run> Retry` fails the same way. Send `Network.setBlockedURLs` with an empty list and `rv click --run <run> Retry`: the race starts.
- **Back while loading.** Open Ride solo on `/?as=kylie` and keep a DevTools session open that sends `Fetch.enable` with `patterns` `[{ "urlPattern": "*/art/<file name>" }]` and holds each `Fetch.requestPaused`. Press Race, wait past the dwell so the card still reads `Loading the road`, then `rv press --run <run> Escape`. Send `Fetch.continueRequest`. Ride solo stays up and no race starts.
- **Start.** Run `rv wait --run <run> race`. The `meter "Speed"` appears; `rv shot --run <run> race-start` shows the countdown digits and the speedometer reading 10TH /10.
- **Pause.** After the countdown, run `rv press --run <run> Escape` and `rv aria --run <run> paused`. `menu "Pause"` shows `RESUME` focused, `RESTART RACE`, `SOUND ON`, `SETTINGS`, `QUIT RACE`.
- **Resume.** Run `rv click --run <run> Resume --within Pause`. The pause menu is gone and countdown digits hold the race for 3 seconds. After them, the speed meter moves while `rv press --run <run> ArrowUp --hold 2000` is held. Throttle during the digits does nothing.
- **Restart.** Run `rv press --run <run> KeyR`, then `rv js --run <run> 'document.querySelector("[role=meter][aria-label=Speed]").getAttribute("aria-valuenow")'`. The countdown starts again and the speed reads `"0"` (with `&prof`, `__rushlineProfile.info().tick` is back to 0).
- **Quit.** Run `rv press --run <run> Escape`, `rv click --run <run> "Quit race" --within Pause`, then `rv click --run <run> Quit --within "Quit race"`. `rv aria --run <run> after-quit` shows `tablist "The bar"` with `tab "Race" selected` and the home panel.
- **Pause overlays.** While paused, run `rv click --run <run> Settings --within Pause`. `region "Settings"` opens on the right with the same rows as the bar's Settings tab. `rv press --run <run> Escape` or `rv click --run <run> Back --within Settings` closes Settings only: the race stays paused. `rv click --run <run> "Quit race" --within Pause` opens the `Quit race` dialog with `KEEP RACING` focused. `rv press --run <run> Escape` closes the dialog only: the race stays paused with `QUIT RACE` focused. Read the focus and the `inert` flag with `rv js --run <run> '[document.activeElement.innerText, document.querySelector("[role=menu][aria-label=Pause]").closest("[inert]") !== null]'`.
- **Settings tab.** With a career save, `rv click --run <run> Settings --within "The bar"`. `rv click --run <run> "New career" --within Settings` opens the `Start over` dialog with `KEEP IT` focused. `rv press --run <run> Escape` closes the dialog only. Open it again and `rv click --run <run> "Erase and start" --within "Start over"` keeps the Settings tab up with `cash: 1500` in the save. `rv press --run <run> Escape` on the tab goes back to the Race tab.
- **Session transcript.** After a change to `apps/web/src/game/game-session.ts` or to how `game.ts` drives it, run this on the build before and the build after in `rv up --dev` slots and diff the lines. `rv open --run <run> "<path>"`, then `rv js --run <run> 'import("/test/session-transcript.ts").then((m) => m.run("<scenario>", { held: () => globalThis.__rushlineHeld === true, release: () => globalThis.__rushlineRelease() }))'`. Each line is a `GameEvents` callback, a change of HUD phase or digit, or what a handle call returned, from a real game on a real WebGL context. Run `pausing` and `finishing` at `/kit?autopilot&at=8000`, `crashing` at `/kit?at=1400&straight&swerve=1500&swervefor=80&swerveto=1`, `holding` at `/kit?autopilot&at=8000&hold=at&holdafter=8100`, and again with `&hold=finish` or `&hold=busted` on those paths, and `attract` and `quittingWhilePreparing` at `/kit`. `crashing` ends `busted` at tick 908 with `onOver` 0.78 s after `onSettle`.
- **Screen sequence.** After a change to `apps/web/src/navigation.ts` or to how `use-flow.ts` and `game-shell.tsx` drive it, walk the paths in this file and in `career.md` on the build before and the build after, and diff what each step lands on. `rv js --run <run> '[document.querySelector("[role=tab][aria-selected=true]")?.textContent, document.querySelector("#bar-panel section")?.getAttribute("aria-label"), [...document.querySelectorAll("[role=menu][aria-label]")].map((menu) => menu.getAttribute("aria-label"))]'` names the tab, the panel and any open menus; a race shows `[role=meter][aria-label=Speed]`. To reach a crash on a single race, open `/?at=1400&straight&swerve=1500&swervefor=80&swerveto=1` and pick Slag Row on Ride solo, then wait for Results: the race ends busted. `apps/web/test/navigation.test.ts` walks the same moves with no browser, so this proves the wiring around them.

## Gotchas

- The bar's tab strip appears once the save has been read; wait for `bar`, not for the page load.
- The ride-out card reads "Loading the road" until the models load, which takes 2-3 seconds on a build and about 20 seconds on `--dev` with `fast4g`.
- R only restarts a single race, and only while racing; in a career race or a room race it does nothing.
- Escape on the pause screen resumes, so pressing it twice is not a way to make sure the game is paused.
- A hidden page pauses the race on its own; if the pause menu appears unasked, run `rv doctor` and check `page visible`.
