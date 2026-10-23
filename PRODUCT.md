# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People playing in a desktop browser on a keyboard or a gamepad. Beyond that, the main audience is not decided: the game has not chosen between players who remember Road Rash and players new to the genre. Until it does, no screen or rule may depend on the player knowing the original.

## Product Purpose

An original motorcycle combat racer in the spirit of the mid-1990s Road Rash games. It keeps their mechanics: fast point-to-point road races, oncoming traffic, fist and weapon fights between riders on the move, police, crashes that throw the rider off the bike, and prize money that buys faster bikes. On top of that it brings a present-day world and graphics, new characters, and new storylines built on the concept the original launched with.

Success is a player who finishes a road and wants another run. Feel is judged by play tests. When the original's measured timings feel slow, the play test wins: the target is modern, fast, physical riding and fighting.

## Positioning

Road Rash's riding and picture composition (a camera that faces along the road, a wide road, big readable riders, scenery at the kerb), rebuilt in cel-shaded 3D in the browser with an original cast, roads, and story. The simulation is deterministic, so the same inputs always produce the same race. Ten named rivals remember what happened between them and the player in earlier races, and their lines and aggression change because of it.

## Operating Context

- Modes: Career (five levels on the same five roads, money, the bike shop, the cast, the story, saved in the browser after every race), Single Race (no money, nothing written to the career), and Multiplayer later on the same simulation.
- Menus are keyboard first: arrows or WASD move, Enter confirms, Escape goes back, everything is also clickable, and a gamepad maps the same way.
- Every screen outside the race is a place or an object in the world: the Lowside bar, its corkboard, the garage, a ticket. Flow and copy are in `docs/design/screens.md`.
- Play tests on other machines are recorded with the tester's consent (`docs/observability.md`).
- Target: 60 frames per second on an integrated-graphics laptop.

## Capabilities and Constraints

- During a race the HUD is one speedometer: speed, gear, place, and progress along the road. There are no health, stamina, or bike condition bars; the rider and the bike show damage themselves.
- Hazards are good to avoid, not must avoid: what one costs depends on speed and lean, and none is a crash on contact.
- A rules-based race director will trigger events during a race. Sponsor billboards come instead of betting. Ads come only if the game gains traction.
- Nothing of Electronic Arts' is used. "Road Rash" is their trademark. Every name, road, bike, rider, line, piece of art, and sound is original.
- Rules and numbers live in `docs/architecture.md` and `docs/design/game-design.md`; the five roads in `docs/design/tracks.md`.
- Undecided: the final name, the main audience, and when multiplayer starts.
- Parked: a classic mode whose interface closely resembles Road Rash's. It is low priority and is not to be planned for now.

## Brand Commitments

- RUSHLINE is the working title. The name will probably change before launch, so nothing should be built that depends on it. LOWSIDE has been proposed. The Lowside is also the bar where the career lives.
- The look accepted on October 13, 2026 is the base: cel-shaded cyberpunk anime with Cyberpunk: Edgerunners as the reference, realistic proportions for the world, bikes, and riders, and a palette of yellow, cyan, magenta, and red on near-black. Details are in `docs/design/art-direction.md`. Rejected: retro low resolution, blocky or toy-like stand-ins, and coloured afterimages on turns.
- The tagline on the loading screen is `Race. Fight. Pay for it.`

## Evidence on Hand

- Design docs: `docs/design/game-design.md`, `screens.md`, `tracks.md`, `art-direction.md`.
- Concept art: `docs/art/city-race-concept.webp`.
- Models: one bike, three rigged riders, a car, and a van in `apps/web/src/game/models`, built by the scripts in `tools/blender`.
- There are no players, reviews, press, or sales figures yet. Do not invent any.

## Product Principles

1. Keep Road Rash's mechanics; let play-test feel set the numbers.
2. The race screen belongs to the road. The world and the riders carry the information, and the HUD stays one small dial.
3. Consequences are real and readable: money, fines, wrecks, and grudges carry over, and a player who crashes can say why.
4. Everything is original, inspired by the concept and never copied from the source.
5. Done means someone played it. Passing tests do not show that it plays well.
