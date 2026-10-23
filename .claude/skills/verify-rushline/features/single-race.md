# Back room and single race

The game opens in the Lowside bar. Escape there, or Back room in its menu, opens the back room: back to the bar, New career, Single race, and Settings. From Single race a player chooses a road, level, and bike on the route board, sees the field on the ride-out card while the road loads, and the race starts by itself with no money at stake. During the race Escape pauses it, and the pause menu resumes, restarts, toggles sound, or quits back to the route board.

## Sub-features

- `back-room` shows Back to the bar (or Career over, Season over, Start over for a damaged save), New career, Single race, and Settings.
- `route-board` shows five road postcards, the chosen road's notes, length, traffic, and police, and the Level and Bike steppers.
- `ride-out` shows the road's flyer, the grid, and "Loading the road", then "Ride", and starts the race about 2 seconds after it opens. It has no buttons; Escape goes back.
- `race-start` counts down 3, 2, 1, then shows the speedometer with place out of 15.
- `pause` freezes the race on Escape and offers Resume, Restart race, Sound, and Quit race.
- `restart` starts the same single race again, from the pause menu or with R.
- `quit` asks to confirm, then returns to the route board.

## How to get to it (user POV)

- Load the site; the bar opens. Press Escape, or choose Back room.
- Choose Single race with the mouse, or move with the arrow keys or W/S and press Enter.
- On the route board, click a postcard or press Left/Right to change road; Left/Right on a stepper changes its value.
- Press Escape during a race to pause; press Escape again to resume.

## Driving it with rv

Preconditions:

- `rv doctor --run <run>` passes.
- A fresh profile (no career save). The bar starts a new career on first load.

- **Back room.** Run `rv open --run <run> / --until bar`, `rv click --run <run> "Back room" --within Clubhouse` and `rv aria --run <run> back-room`. The tree shows `menu "Back room"` with `BACK TO THE BAR` focused, `NEW CAREER`, `SINGLE RACE`, and `SETTINGS`.
- **Route board.** Choose Single race. Run `rv click --run <run> "Single race" --within "Back room"`, then `rv wait --run <run> 'document.querySelector("[role=menu][aria-label=\"Route board\"]") !== null'`. The route board heading and `menu "Route board"` with `LEVEL 1`, `BIKE HALDEN WREN 400`, `RACE`, `BACK` appear.
- **Pick a road.** Click Slag Row's postcard. Run `rv click --run <run> "Slag Row"` and `rv aria --run <run> route-board`. The fourth postcard button is `pressed=true` and the heading reads `SLAG ROW`.
- **Steppers.** Run `rv click --run <run> Level --within "Route board"` and `rv click --run <run> Bike --within "Route board"`, then `rv aria --run <run> steppers`. A click steps forward and wraps. With no career save only level 1 and the Halden Wren 400 are offered, so both still read `LEVEL 1` and `BIKE HALDEN WREN 400`; with a save, the levels reached and the bikes in its garage appear.
- **Ride out.** Run `rv click --run <run> Race --within "Route board"` and `rv shot --run <run> ride-out`. The card shows the flyer and the grid with YOU last.
- **Start.** Run `rv wait --run <run> race`. The `meter "Speed"` appears; `rv shot --run <run> race-start` shows the countdown digits and the speedometer reading 15TH /15.
- **Pause.** After the countdown, run `rv press --run <run> Escape` and `rv aria --run <run> paused`. `menu "Pause"` shows `RESUME` focused, `RESTART RACE`, `SOUND ON`, `QUIT RACE`.
- **Resume.** Run `rv click --run <run> Resume --within Pause`. The pause menu is gone and the speed meter moves again while `rv press --run <run> ArrowUp --hold 2000` is held.
- **Restart.** Run `rv press --run <run> KeyR`, then `rv js --run <run> 'document.querySelector("[role=meter][aria-label=Speed]").getAttribute("aria-valuenow")'`. The countdown starts again and the speed reads `"0"` (with `&prof`, `__rushlineProfile.info().tick` is back to 0).
- **Quit.** Run `rv press --run <run> Escape`, `rv click --run <run> "Quit race" --within Pause`, then `rv click --run <run> Quit --within "Quit race"`. `rv aria --run <run> after-quit` shows `menu "Route board"` with `RACE` focused.

## Gotchas

- The bar appears only after the save has been read and its art has decoded; wait for `bar`, not for the page load.
- Steppers are matched by their label line (`Level`, `Bike`), not by the value; `rv click "Level 1"` finds nothing.
- The road postcards are buttons without accessible names, so `rv aria` lists them as `button pressed=...`; click them by their visible road name.
- Race stays disabled and the ride-out card reads "Loading the road" until the models load, which takes 2-3 seconds on a build and about 20 seconds on `--dev` with `fast4g`.
- R only restarts a single race, and only while racing; in a career race it does nothing.
- Escape on the pause screen resumes, so pressing it twice is not a way to make sure the game is paused.
- A hidden page pauses the race on its own; if the pause menu appears unasked, run `rv doctor` and check `page visible`.
