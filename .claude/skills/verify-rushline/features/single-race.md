# Back room and single race

The game opens in the Lowside bar. Escape there, or Back room in its menu, opens the back room: back to the bar, New career, Single race, and Settings. From Single race a player chooses a road, tier, and bike on the route board, sees the field on the ride-out card while the road loads, and the race starts by itself with no money at stake. During the race Escape pauses it, and the pause menu resumes, restarts, toggles sound, or quits back to the route board.

## Sub-features

- `back-room` shows Back to the bar (or Career over, Season over, Start over for a damaged save, Try again for an unreadable one, Career while the save loads), New career, Single race, and Settings.
- `route-board` shows the Single race list pinned in the back room with Road, Tier, and Bike steppers, the chosen road's flyer, its length, traffic, police, and home riders on the cyan note, and its description on the pink note. Tier and Bike stay inside the current career: after New career they read tier 1 and the bike that career owns, and the race rides them.
- `ride-out` shows the road's flyer, the grid, and "Loading the road", then "Ride", and starts the race about 2 seconds after it opens. It has no buttons; Escape goes back.
- `ride-out-failed-load` shows `The riders did not load.` with Retry and Back when a rider's model cannot load. Retry prepares the race again and starts it without waiting out the dwell again. A Retry before the dwell ends still waits it out. Back returns to the route board.
- `ride-out-back` leaves the card while the road is loading, and the preparation that finishes later starts nothing.
- `race-start` counts down 3, 2, 1, then shows the speedometer with place out of 10.
- `pause` freezes the race on Escape and offers Resume, Restart race, Sound, Settings, and Quit race. A career race drops Restart race and asks Quit and pay ([career.md](career.md)); a room race does not pause.
- `resume` holds the race for 3 seconds with countdown digits, then lets it run.
- `restart` starts the same single race again, from the pause menu or with R. Neither a career race nor a room race restarts.
- `quit` asks to confirm, then returns to the route board.

## How to get to it (user POV)

- Load the site; the bar opens. Press Escape, or choose Back room.
- Choose Single race with the mouse, or move with the arrow keys or W/S and press Enter.
- On the route board, Left/Right on a stepper (Road, Tier, Bike) changes its value; a click on a stepper or on the flyer steps forward.
- Press Escape during a race to pause; press Escape again to resume.

## Driving it with rv

Preconditions:

- `rv doctor --run <run>` passes.
- A fresh profile (no career save). The bar starts a new career on first load.

- **Back room.** Run `rv open --run <run> / --until bar`, `rv click --run <run> "Back room" --within Clubhouse` and `rv aria --run <run> back-room`. The tree shows `menu "Back room"` with `BACK TO THE BAR` focused, `NEW CAREER`, `SINGLE RACE`, and `SETTINGS`.
- **Route board.** Choose Single race. Run `rv click --run <run> "Single race" --within "Back room"`, then `rv wait --run <run> 'document.querySelector("[role=menu][aria-label=\"Route board\"]") !== null'`. `menu "Route board"` with `ROAD`, `TIER 1`, `BIKE HALDEN WREN 400`, `RACE`, `BACK` appears under the `SINGLE RACE` heading.
- **Pick a road.** Run `rv click --run <run> Road --within "Route board"` until the Road stepper reads `SLAG ROW` (it opens on Ridge Road, so two clicks; each click steps forward and wraps), or focus it and press `ArrowRight`. `rv js --run <run> 'document.activeElement.innerText'` reads `ROAD ◄ SLAG ROW ►` and the flyer shows Slag Row.
- **Steppers.** Run `rv click --run <run> Tier --within "Route board"` and `rv click --run <run> Bike --within "Route board"`, then `rv aria --run <run> steppers`. A click steps forward and wraps. With no career save only tier 1 and the Halden Wren 400 are offered, so both still read `TIER 1` and `BIKE HALDEN WREN 400`; with a save, the tiers reached and the bikes in its garage appear.
- **Ride out.** Run `rv click --run <run> Race --within "Route board"` and `rv shot --run <run> ride-out`. The card shows the flyer and the grid with YOU last.
- **Failed load and Retry.** `?as=` works only in a development build, which is what `rv` serves. Read the model's file name from `apps/web/src/assets/art.json`, open the route board on `/?as=kylie`, and keep a DevTools session open on the page's port that sends `Network.enable` and `Network.setBlockedURLs` with `urlPatterns` `[{ "urlPattern": "*://*:*/art/<file name>", "block": true }]`. Run `rv click --run <run> Race --within "Route board"`. The card shows the alert with Retry and Back, and no speed meter appears past the dwell. `rv click --run <run> Retry` fails the same way. Send `Network.setBlockedURLs` with an empty list and `rv click --run <run> Retry`: the race starts.
- **Back while loading.** Open the route board on `/?as=kylie` and keep a DevTools session open that sends `Fetch.enable` with `patterns` `[{ "urlPattern": "*/art/<file name>" }]` and holds each `Fetch.requestPaused`. Press Race, wait past the dwell so the card still reads `Loading the road`, then `rv press --run <run> Escape`. Send `Fetch.continueRequest`. The route board stays up and no race starts.
- **Start.** Run `rv wait --run <run> race`. The `meter "Speed"` appears; `rv shot --run <run> race-start` shows the countdown digits and the speedometer reading 10TH /10.
- **Pause.** After the countdown, run `rv press --run <run> Escape` and `rv aria --run <run> paused`. `menu "Pause"` shows `RESUME` focused, `RESTART RACE`, `SOUND ON`, `SETTINGS`, `QUIT RACE`.
- **Resume.** Run `rv click --run <run> Resume --within Pause`. The pause menu is gone and countdown digits hold the race for 3 seconds. After them, the speed meter moves while `rv press --run <run> ArrowUp --hold 2000` is held. Throttle during the digits does nothing.
- **Restart.** Run `rv press --run <run> KeyR`, then `rv js --run <run> 'document.querySelector("[role=meter][aria-label=Speed]").getAttribute("aria-valuenow")'`. The countdown starts again and the speed reads `"0"` (with `&prof`, `__rushlineProfile.info().tick` is back to 0).
- **Quit.** Run `rv press --run <run> Escape`, `rv click --run <run> "Quit race" --within Pause`, then `rv click --run <run> Quit --within "Quit race"`. `rv aria --run <run> after-quit` shows `menu "Route board"` with `RACE` focused.
- **Pause overlays.** While paused, run `rv click --run <run> Settings --within Pause`. `menu "Settings"` has `FRAME RATE` focused and `menu "Pause"` sits under an `inert` stage. `rv press --run <run> Escape` closes Settings only: the race stays paused with `SETTINGS` focused. `rv click --run <run> "Quit race" --within Pause` opens the `Quit race` dialog with `KEEP RACING` focused. `rv press --run <run> Escape` closes the dialog only: the race stays paused with `QUIT RACE` focused. Read the focus and the `inert` flag with `rv js --run <run> '[document.activeElement.innerText, document.querySelector("[role=menu][aria-label=Pause]").closest("[inert]") !== null]'`.
- **Back room overlays.** With a career save, `rv press --run <run> Escape` in the back room returns to the bar, and Back room opens it again. `rv click --run <run> Settings --within "Back room"`, then `rv press --run <run> Escape`, leaves `menu "Back room"` up with `SETTINGS` focused. `rv click --run <run> "New career" --within "Back room"` opens the `Start over` dialog with `KEEP IT` focused. `rv press --run <run> Escape` closes the dialog only, with `NEW CAREER` focused. Open it again and `rv click --run <run> "Erase and start" --within "Start over"` lands on the bar with `cash: 1500` in the save. With a damaged save, as in [career.md](career.md), Escape does nothing and Start over erases at once with no dialog.
- **Session transcript.** After a change to `apps/web/src/game/game-session.ts` or to how `game.ts` drives it, run this on the build before and the build after in `rv up --dev` slots and diff the lines. `rv open --run <run> "<path>"`, then `rv js --run <run> 'import("/test/session-transcript.ts").then((m) => m.run("<scenario>", { held: () => globalThis.__rushlineHeld === true, release: () => globalThis.__rushlineRelease() }))'`. Each line is a `GameEvents` callback, a change of HUD phase or digit, or what a handle call returned, from a real game on a real WebGL context. Run `pausing` and `finishing` at `/kit?autopilot&at=8000`, `crashing` at `/kit?at=1400&straight&swerve=1500&swervefor=80&swerveto=1`, `holding` at `/kit?autopilot&at=8000&hold=at&holdafter=8100`, and again with `&hold=finish` or `&hold=busted` on those paths, and `attract` and `quittingWhilePreparing` at `/kit`. `crashing` ends `busted` at tick 908 with `onOver` 0.78 s after `onSettle`.
- **Screen sequence.** After a change to `apps/web/src/navigation.ts` or to how `use-flow.ts` and `game-shell.tsx` drive it, walk the paths in this file and in `career.md` on the build before and the build after, and diff what each step lands on. `rv js --run <run> '[...document.querySelectorAll("[role=menu][aria-label]")].map((menu) => menu.getAttribute("aria-label"))'` names the open menus; a race has no menu and shows `[role=meter][aria-label=Speed]`. To reach a crash on a single race, open `/?at=1400&straight&swerve=1500&swervefor=80&swerveto=1` and pick Slag Row on the route board, then wait for Results: the race ends busted. `apps/web/test/navigation.test.ts` walks the same moves with no browser, so this proves the wiring around them.

## Gotchas

- The bar appears only after the save has been read and its art has decoded; wait for `bar`, not for the page load.
- Steppers are matched by their label line (`Road`, `Tier`, `Bike`), not by the value; `rv click "Tier 1"` finds nothing.
- The flyer is a button named `{road}. Show another road`; it is out of the tab order, and a click shows the next road.
- Race stays disabled and the ride-out card reads "Loading the road" until the models load, which takes 2-3 seconds on a build and about 20 seconds on `--dev` with `fast4g`.
- R only restarts a single race, and only while racing; in a career race or a room race it does nothing.
- Escape on the pause screen resumes, so pressing it twice is not a way to make sure the game is paused.
- A hidden page pauses the race on its own; if the pause menu appears unasked, run `rv doctor` and check `page visible`.
