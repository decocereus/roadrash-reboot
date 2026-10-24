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
- **Crash, quickly.** Run `rv open --run <run> "/?ride=slag-row&at=600&autopilot&swerve=700&swervefor=80&swerveto=1&hold=crash&holdafter=20" --until race`, `rv wait --run <run> held --timeout 90`, `rv shot --run <run> crash`. The frozen frame shows WIPEOUT over the road, the bike down on the right-hand pavement, the rider in the air beyond it, and the speedometer dimmed.
- **Remount.** Run `rv js --run <run> 'globalThis.__rushlineRelease()'`, `rv wait --run <run> 'Number(document.querySelector("[role=meter][aria-label=Speed]").getAttribute("aria-valuenow")) > 30' --timeout 30`, `rv shot --run <run> remounted`. About ten seconds later the rider is back on the bike in first gear and the speedometer is lit again.
- **Finish, quickly.** Run `rv open --run <run> "/?ride=breakwater-run&at=8400&autopilot" --until race` and `rv wait --run <run> 'document.querySelector("[role=menu][aria-label=Finish]") !== null' --timeout 120`. The finish banner appears about nine seconds later with the place, and `rv click --run <run> Continue --within Finish` opens `menu "Results"` with `RACE AGAIN` and `CONTINUE`.
- **Bike models and rider contact.** Each maker's bikes share one model: Ostra rides the Seraph, Halden the Ghost, Brack the Oni, the Gutter Pup the original bike (`apps/web/src/game/bike-models.ts`). A `?ride=` race at `&level=3` fields all three makers. To check the rider on every model, start a `--dev` slot at `/kit?prof` and run `rv js --run <run> 'import("/test/bike-contact.ts").then((m) => m.run("side"))'`, then `rv shot --run <run> contact-side`. Pass `"detail"` for a close side view, `"front"` for a front three-quarter view or `"portrait"` for a close front three-quarter view of the rider's upper body, a second argument 0 to 2 for the rider build, and a third argument `"kylie"` or `"ronaldo"` to seat a celebrity instead. The sheet shows the four models in rows and rest, tuck, full lean, punch and kick in columns. The hands sit on the grips, the seat under the rider, and the feet on the pegs in every cell. It returns the rest pose's hand and foot positions in the bike's model space; the grips are at about (±0.3, 0.95, 0.37), the original pegs at (±0.25, 0.43, -0.30) and the cyber pegs at (±0.19, 0.40, -0.20).
- **Celebrity riders.** Kylie and Ronaldo are painted from one albedo atlas each (`rider_kylie.glb`, `rider_ronaldo.glb`) and the cast does not name them yet, so a `--dev` slot dresses riders by flag. `/?ride=breakwater-run&autopilot&prof&as=kylie&against=ronaldo,kylie` makes the player Kylie and the first two rival racers Ronaldo and Kylie; add `&at=600` to start out on the road. Shoot the grid and the pack. The celebrities show their atlas (Kylie's silver coat and feathers, Ronaldo's blue kit with gold epaulettes) with cel bands and ink outlines, and every other rider keeps a dark suit and a palette-coloured helmet. For a close-up run `rv js --run <run> 'import("/test/bike-contact.ts").then((m) => m.run("portrait", 0, "kylie"))'` at `/kit?prof`, then `rv shot`. In the race, read `__rushlineProfile` over the race's frames: `created.programs` and `created.textures` on its first frame equal those on its last, so the atlas and the painted material's extra program were made in warm-up. A race with a celebrity has one more live program than the same race without.
- **Garage stand.** In the garage, `rv click --run <run> "Ostra Sesta 600" --within Catalogue` turns the stand to the Seraph, and the same for a Halden (Ghost), a Brack (Oni) or the Gutter Pup (the original bike). Clicking a bike the player can afford also opens the Buy confirm; `rv click --run <run> "Not yet" --within Buy` closes it without buying.

## Gotchas

- Inputs before the green light do nothing; wait for the tick to pass 0 or for the countdown digits to go.
- `rv press` holds every key it is given together, then releases them; a long hold is one press, not autorepeat.
- `?autopilot` takes the player's inputs away; do not combine it with `rv press` and expect the keys to count. `?swerve` still overrides the pilot's steering.
- `?hold` fires once per page load. Reopen the page to catch the moment again.
- `?at` also moves the player in every later race the page starts, including career races.
- The pack and the fights depend on the AI pilot; a recipe that relies on a rival being alongside at a given second can drift when `packages/sim/src/pilot.ts` or a `pilot-*.ts` file beside it changes. Check the screenshot, not just the command.
