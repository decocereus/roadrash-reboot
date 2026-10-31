# Riding and fighting

In a race the player rides a motorcycle down a point-to-point road through traffic with the rivals the race rules seat, nine at the served field of ten, and the police. The chase camera sits behind the bike; the only HUD is the speedometer with gear, place, and a progress arc. The player punches and kicks riders alongside, crashes when they hit traffic or the roadside, runs back to the bike and gets on again, gets warned when a cop is near, and finishes at the end of the road.

## Sub-features

- `ride-throttle` raises speed and gear while throttle is held.
- `ride-brake` lowers speed while brake is held.
- `ride-steer` moves the bike across the road and leans it.
- `fight-punch` swings at a rider alongside with Space or J.
- `fight-kick` kicks a rider alongside with Shift or K.
- `crash` throws the rider off the bike after hitting the roadside or traffic.
- `remount` puts the rider back on the bike after they run to it.
- `cop-warning` shows the cop's distance at the top, blinking red under 80 m.
- `finish` shows the place out of the field and a Continue banner at the end of the road.

## How to get to it (user POV)

- Start any race: Single race, a career race, or a `?ride=` race.
- Hold the arrow keys or WASD; Space or J punches, Shift or K kicks.
- A gamepad's left stick steers, triggers throttle and brake, and face buttons punch and kick.

## Driving it with rv

Preconditions:

- `rv doctor --run <run>` passes.
- A race is past its countdown: the quick way is `rv open --run <run> "/?ride=slag-row&prof" --until race`, then `rv wait --run <run> 'globalThis.__rushlineProfile.info().tick > 0'`.

- **Throttle.** Hold throttle. Run `rv press --run <run> ArrowUp --hold 4000`, then `rv js --run <run> 'document.querySelector("[role=meter][aria-label=Speed]").getAttribute("aria-valuenow")'`. The speed is well above 0: about 95 km/h after three seconds from the line on the Ostra Sesta on Ridge Road.
- **Brake.** Run `rv press --run <run> ArrowDown --hold 1500` and read the speed again. It is lower than before.
- **Steer.** Run `rv shot --run <run> steer-before`, `rv press --run <run> ArrowUp ArrowRight --hold 800`, `rv shot --run <run> steer-after`. The bike sits further right on the road and leans into the turn.
- **Punch.** Ride up beside a rival (`?ride=slag-row` starts the player last of 15, with the pack ahead), then run `rv press --run <run> ArrowUp Space --hold 600` and `rv shot --run <run> punch`. The rider's arm swings to the side the rival is on; a landed punch shows the rival flinch.
- **Kick.** Run `rv press --run <run> ArrowUp ShiftLeft --hold 600` and `rv shot --run <run> kick`. The rider rises off the seat and kicks toward the near side.
- **Crash, quickly.** Run `rv open --run <run> "/?ride=slag-row&at=600&straight&swerve=700&swervefor=80&swerveto=1&hold=crash&holdafter=20" --until race`, `rv wait --run <run> held --timeout 90`, `rv shot --run <run> crash`. The frozen frame shows WIPEOUT over the road, the bike down on the right-hand pavement, the rider in the air beyond it, and the speedometer dimmed.
- **Remount.** Run `rv js --run <run> 'globalThis.__rushlineRelease()'`, `rv wait --run <run> 'Number(document.querySelector("[role=meter][aria-label=Speed]").getAttribute("aria-valuenow")) > 30' --timeout 30`, `rv shot --run <run> remounted`. About ten seconds later the rider is back on the bike in first gear and the speedometer is lit again.
- **Finish, quickly.** Run `rv open --run <run> "/?ride=breakwater-run&at=8400&autopilot" --until race` and `rv wait --run <run> 'document.querySelector("[role=menu][aria-label=Finish]") !== null' --timeout 120`. The finish banner appears about nine seconds later with the place, and `rv click --run <run> Continue --within Finish` opens `menu "Results"` with `RACE AGAIN` and `CONTINUE`.
- **Bike models and rider contact.** Each maker's bikes share one model: Ostra rides the Seraph, Halden the Ghost, Brack the Oni, the Gutter Pup the original bike (`apps/web/src/game/bike-models.ts`). A `?ride=` race at `&level=3` fields all three makers. To check the rider on every model, start a `--dev` slot at `/kit?prof` and run `rv js --run <run> 'import("/test/bike-contact.ts").then((m) => m.run("side"))'`, then `rv shot --run <run> contact-side`. Pass `"detail"` for a close side view, `"front"` for a front three-quarter view, `"portrait"` for a close front three-quarter view of the rider's upper body or `"grips"` for a close look from above at both hands on the bar, a second argument 0 to 2 for the rider build, and a third argument, one of `celebrityIds` in `apps/web/src/game/figure-wear.ts` such as `"kylie"`, to seat that celebrity instead. The sheet shows the four models in rows and rest, tuck, full lean, punch and kick in columns. The hands sit on the grips, the seat under the rider, and the feet on the pegs in every cell, except the punching hand and the kicking foot. In the kick the torso pitches over the bars so the planted hand reaches its grip, by about 21 degrees on build 1. It returns the rest pose's hand and foot positions in the bike's model space; the grips are at about (±0.3, 0.95, 0.37), the original pegs at (±0.25, 0.43, -0.30) and the cyber pegs at (±0.19, 0.40, -0.20).
- **Celebrity riders.** Six celebrities, `kylie`, `ronaldo`, `mbappe`, `musk`, `altman` and `ranveer`, are painted from one albedo atlas each (`rider_<id>.glb`) and the cast does not name them yet, so a `--dev` slot dresses riders by flag. `/?ride=breakwater-run&autopilot&prof&as=kylie&against=ronaldo,kylie` makes the player Kylie and the first two rival racers Ronaldo and Kylie; add `&at=600` to start out on the road. `&against=kylie,ronaldo,mbappe,musk,altman,ranveer&with=field` puts all six in one pack. The attract race behind the menus wears none. Shoot the grid and the pack. The celebrities show their atlas with cel bands and ink outlines, and every other rider keeps a dark suit and a palette-coloured helmet. A race downloads only the celebrities it names: in DevTools' network log, `/?ride=madrid-hook&with=field` requests no `rider_<id>` GLB, a flagged race requests each named one once, and restarting with R requests nothing. For a close-up run `rv js --run <run> 'import("/test/bike-contact.ts").then((m) => m.run("portrait", 0, "kylie"))'` at `/kit?prof`, then `rv shot`. In the race, read `__rushlineProfile` over the race's frames: `created.programs` and `created.textures` on its first frame equal those on its last, so the atlas and the painted material's extra program were made in warm-up. A race with a celebrity has one more live program than the same race without.
- **Riders react to sun and shade.** On a `--dev` slot open `/?ride=breakwater-run&with=alone&autopilot&at=200` and run `rv screencast --run <run> sun --seconds 20 --every 15`; add `&as=kylie` for a light-coloured rider, and use `slag-row` for night. Between about 3 and 12 seconds the road passes from sun into a building's shadow and back. In sun the rider's and the bike's edges that face the sun carry a hard rim in the look's rim colour (cream at dusk, cyan at night) and the bike's gloss shines; in the shadow both are gone and the rider's shadow side is darker, and they return together when the road is sunlit again.
- **Rider and bike shadows keep their colour.** At `/kit?prof` on a `--dev` slot, run `rv js --run <run> 'import("/test/rider-shade.ts").then((m) => m.run("portrait"))' > portrait.json`, and again with `"chase"`. It seats the six celebrities and generic build 0 under the dusk, night and dawn tones (every other look reuses one of those three) and renders each through the real cel materials and post chain three times: once all lit, with the light from the camera, once all in shadow, with the light off, and once all lit with white ink to find every pixel an outline touches. Bloom is off in those passes, because a frame that is all lit blooms where a frame that is all shadow does not. It pairs each ink-free pixel's lit and shadow colours, groups them into flats by their lit colour, and returns each flat's OKLCH lit and shadow colours with `pixelDrift.median`, the median hue change from lit to shadow over the flat's pixels whose chroma is at least 0.03. Every flat with chroma at least 0.03 and at least 2% of the figure stays within 15°; a neutral flat's shadow chroma stays near its lit chroma instead of rising to 0.1 or more. `sheet` is a PNG data URL of the normal key-lit renders. `m.run("bike", "bikes")` measures bikes instead, in a view that frames the whole bike: every one of the 18 palette paints, each on one of the four models in turn. Each paint holds its own hue within 15° from lit to shadow under every look, apart from near-neutral flats whose lit chroma sits at the 0.03 floor, where a few hundred pixels set the hue; `"chase"` and `"portrait"` work for bikes as well.
- **Garage stand.** In the garage, `rv click --run <run> "Ostra Sesta 600" --within Catalogue` turns the stand to the Seraph, and the same for a Halden (Ghost), a Brack (Oni) or the Gutter Pup (the original bike). Clicking a bike the player can afford also opens the Buy confirm; `rv click --run <run> "Not yet" --within Buy` closes it without buying.

## Gotchas

- Inputs before the green light do nothing; wait for the tick to pass 0 or for the countdown digits to go.
- `rv press` holds every key it is given together, then releases them; a long hold is one press, not autorepeat.
- `?autopilot` takes the player's inputs away; do not combine it with `rv press` and expect the keys to count. `?swerve` steers only a player you ride, so force a line with `?straight&swerve`.
- `?hold` fires once per page load. Reopen the page to catch the moment again.
- `?at` also moves the player in every later race the page starts, including career races.
- The pack and the fights depend on the AI pilot; a recipe that relies on a rival being alongside at a given second can drift when `packages/sim/src/pilot.ts` or a `pilot-*.ts` file beside it changes. Check the screenshot, not just the command.
