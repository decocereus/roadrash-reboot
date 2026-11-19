# Sound

Every sound comes from `apps/web/src/sound`: menu clicks and moves, the bar's footsteps, actions, door and room bed, and the race's engine, wind and one-shots. The page is silent until the first press, then renders its cues in the background. The browser `rv` drives is muted (`--mute-audio`), which no saved setting reaches, so these checks count which cue played instead of listening.

## Sub-features

- `unlock`: the first click or key makes the audio context and loads the mixer. No console error before or after.
- `interface`: hover and keyboard focus play `move`, a click plays `press`, Back and Esc play `back`, a tab change plays `tab`, the race menu plays `menuOpen` and `menuClose`, accepting the first-visit card plays `welcome`, and `Do it` on a bike plays `buy`.
- `bar`: the player's footsteps follow the walk and run, the two nearest others' steps play quieter, greet, shove, sitting and posing each play once, the door plays when a race is called, and the room bed plays until the door lifts.
- `race`: hits, crashes, near misses, landings and the siren, from the race's own events.
- `settings`: Settings has `Sound` (on or off, the same switch as `M` in a race) and `Effects` (Low, Mid, High, Full), both saved in `rushline.settings.v1`.
- `bank`: how long rendering the cues took after the first press, and the longest piece of main-thread work it did at once.

## How to get to it (user POV)

Open the game and click anything. Settings is the third tab in the bar.

## Driving it with rv

Preconditions: a slot from `rv up`. Click once in the page before anything else, because nothing loads before the first press.

- Count cues: after the first click, `rv js --run <run> 'JSON.stringify(__rushlineSound.heard())'` lists how many times each cue played. Hover a tab with `rv click`, change tab, press `Escape`, and read it again: `move`, `press`, `tab` and `back` go up by one each.
- Check the render cost: `rv throttle --run <run> --cpu 4`, open the page fresh, click once, wait two seconds, then `rv js --run <run> 'JSON.stringify(__rushlineSound.stats())'`. `rendered` is the number of cues, `longestSliceMs` stays under 4 and `waitedMs` is the wall time to the last cue.
- Bar cues: in the bar, `rv js --run <run> '__rushlineBar.walkTo(2, -1)'`, wait two seconds, and `walkStep` or `runStep` in `heard()` has gone up. `rv press --run <run> KeyE --hold 80` near a stool plays `sit`. `rv js --run <run> 'JSON.stringify(__rushlineSound.looping())'` reads the room bed's level, `0.5` in the bar and `0` once `__rushlineBar.openDoor()` has lifted the door, which also plays `door`.
- Race cues: `rv open --run <run> "/?ride=breakwater-run&autopilot" --until race`, ride for 20 seconds and read `heard()`. A crash, a hit or a near miss each raise their own count, once per event.
- Mute: `rv press --run <run> KeyM --hold 80` in a race, then `rv js --run <run> 'JSON.parse(localStorage.getItem("rushline.settings.v1")).muted'` reads `true`, and the Settings tab shows `Sound Off`.
- Record a clip with sound for the owner: open the page with `?prof`, then `rv js --run <run> '__rushlineSound.record(40)'` returns the game's own mix as base64 WebM audio, taken before the browser's mute. Run `rv screencast` over the same 40 seconds and join the two with `ffmpeg`.
- Hear every cue on its own: `pnpm sound:audition` writes a WAV per cue and `tools/sound/results/chromium/index.html`.

## Gotchas

- `__rushlineSound` exists only after the first press, because the mixer loads then.
- `record` returns `null` without `?prof` in the address.
