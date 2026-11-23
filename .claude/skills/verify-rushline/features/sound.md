# Sound

Every sound comes from `apps/web/src/sound`: menu clicks and moves, the bar's footsteps, actions and door, and the race's engine, wind and one-shots. The page is silent until the first press, then renders its cues in the background. The browser `rv` drives is muted (`--mute-audio`), which no saved setting reaches, so these checks count which cue played instead of listening.

## Sub-features

- `unlock`: the first click or key makes the audio context and loads the mixer. No console error before or after.
- `interface`: hover and keyboard focus play `move`, a click plays `press`, Back and Esc play `back`, a tab change plays `tab`, the race menu plays `menuOpen` and `menuClose`, accepting the first-visit card plays `welcome`, and `Do it` on a bike plays `buy`.
- `bar`: the player's footsteps follow the walk and run, the two nearest others' steps play quieter, greet, shove, sitting and posing each play once, and the door plays when a race is called. Between those the bar is silent.
- `race`: the countdown beeps and go, the player's engine in its class, wind and tyre scrub, a landing, hits by weapon, crashes, near misses, the siren, a place gained or lost (held half a second), and the finish, from the race's own events. Others' engines, hits and crashes are panned and faded by where they are.
- `settings`: Settings has `Sound` (on or off, the same switch as `M` in a race) and `Effects` (Low, Mid, High, Full), both saved in `rushline.settings.v1`.
- `bank`: how long rendering the cues took after the first press, and the longest piece of main-thread work it did at once.

## How to get to it (user POV)

Open the game and click anything. Settings is the third tab in the bar.

## Driving it with rv

Preconditions: a slot from `rv up`. Click once in the page before anything else, because nothing loads before the first press.

- Count cues: after the first click, `rv js --run <run> 'JSON.stringify(__rushlineSound.heard())'` lists how many times each cue played. Hover a tab with `rv click`, change tab, press `Escape`, and read it again: `move`, `press`, `tab` and `back` go up by one each.
- Check the render cost: `rv throttle --run <run> --cpu 4`, open the page fresh, click once, wait two seconds, then `rv js --run <run> 'JSON.stringify(__rushlineSound.stats())'`. `rendered` is the number of cues, `longestSliceMs` stays under 4 and `waitedMs` is the wall time to the last cue.
- Bar cues: in the bar, `rv js --run <run> '__rushlineBar.walkTo(2, -1)'`, wait two seconds, and `walkStep` or `runStep` in `heard()` has gone up. `rv press --run <run> KeyE --hold 80` near a stool plays `sit`. `__rushlineBar.openDoor()` lifts the door and plays `door`.
- Race cues: `rv open --run <run> "/?ride=breakwater-run&autopilot&prof" --until "document.readyState==='complete'"`, then at once `rv press --run <run> ShiftRight`, which loads the mixer before the countdown and does nothing else in a race. Ride for 20 seconds and read `heard()`. `count` has gone up by three and `go` by one, and a crash, a hit by weapon, a landing or a near miss each raise their own count, once per event. `rv js --run <run> 'JSON.stringify(__rushlineSound.passing())'` lists the four passing voices: the rider or car each one carries, its level and its pan, negative on the left.
- Mute: `rv press --run <run> KeyM --hold 80` in a race, then `rv js --run <run> 'JSON.parse(localStorage.getItem("rushline.settings.v1")).muted'` reads `true`, and the Settings tab shows `Sound Off`.
- Record a clip with sound for the owner: open the page with `?prof`, then `rv js --run <run> '__rushlineSound.record(40)'` returns the game's own mix as base64 WebM audio, taken before the browser's mute. Run `rv screencast` over the same 40 seconds and join the two with `ffmpeg`.
- Hear every cue on its own: `pnpm sound:audition` writes a WAV per cue and `tools/sound/results/chromium/index.html`.

## Gotchas

- `__rushlineSound` exists only after the first press, because the mixer loads then.
- `record` returns `null` without `?prof` in the address.
