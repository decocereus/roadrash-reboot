# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People who played Road Rash and want a game with the same mechanics, playing in a desktop browser on a keyboard or a gamepad. Many arrive from short clips on social media. The game is desktop only: on a phone it tells the visitor to open it on a desktop.

## Product Purpose

An original motorcycle combat racer in the spirit of the mid-1990s Road Rash games. It keeps their mechanics: fast point-to-point road races, oncoming traffic, fist and weapon fights between riders on the move, police, crashes that throw the rider off the bike, and prize money that buys faster bikes.

The world is a near-future version of the real one. Illegal road races are streamed around the world, and people watch them and bet on them. The player is an unknown rider climbing that league against parodies of real celebrities from tech, sport, film, and social media. Each celebrity's story comes from the public memes about them, and real feuds carry into the races. The races tour real cities with a cyberpunk twist.

Success is a player who finishes a road and wants another run. Feel is judged by play tests. When the original's measured timings feel slow, the play test wins: the target is modern, fast, physical riding and fighting.

## Positioning

Road Rash's riding and picture composition (a camera that faces along the road, a wide road, big readable riders, scenery at the kerb), rebuilt in cel-shaded 3D in the browser, with real cities and parody celebrities in place of the original's fictional roads and riders. The simulation is deterministic, so the same inputs always produce the same race. The named rivals remember what happened between them and the player in earlier races, and their lines and aggression change because of it.

## Operating Context

- Modes: Career (your own rider, money, the bike shop, the cast, the story), Single Race (no money, nothing written to the career), and Multiplayer (rooms joined with a code, plus a public Quick Race). All three ship at launch on the same simulation.
- Launch scope: three cities (Madrid, Mumbai, and a Bay Area mountain road), six parody celebrities, ten riders a race, and a career of three levels across the three cities plus a finale. `docs/architecture.md` has the build order.
- Accounts: anyone can play, and start a career, as a guest, and a guest's career saves in the browser. Signing in, with Discord, Google, or an emailed link, adds saving across devices and is required to buy something or to race online.
- Menus are keyboard first: arrows or WASD move, Enter confirms, Escape goes back, everything is also clickable, and a gamepad maps the same way.
- Every screen outside the race is a place or an object in the world: the Lowside bar, its corkboard, the garage, a ticket. Flow and copy are in `docs/design/screens.md`.
- Play tests on other machines are recorded with the tester's consent (`docs/observability.md`).
- Target: 60 frames per second on an integrated-graphics laptop.

## Capabilities and Constraints

- During a race the HUD is one speedometer: speed, gear, place, and progress along the road. There are no health, stamina, or bike condition bars; the rider and the bike show damage themselves.
- Hazards are good to avoid, not must avoid: what one costs depends on speed and lean, and none is a crash on contact.
- A rules-based race director decides which obstacles appear where and how they move. It is code, not a character in the story.
- The game is free. Money comes from sponsors, who buy billboards along the roads, and from cosmetics: character skins and bike skins at listed prices. Nothing sold changes speed or handling, there are no random loot boxes, and bikes are earned with prize money, never bought.
- Celebrities are parodies: a twisted name on a recognisable caricature, never a real name, photo, or exact likeness. Jokes come from public, well-known memes and never claim real crimes or private facts. Bike makers get parody brands with no logos. A lawyer reviews the cast, the brands, and the store before launch.
- Nothing of Electronic Arts' is used. "Road Rash" is their trademark. Every name, road, bike, rider, line, piece of art, and sound is original.
- Rules and numbers live in `docs/architecture.md` and `docs/design/game-design.md`; the roads in `docs/design/tracks.md`.
- Undecided: the final name, where the database is hosted, the payment provider (Polar or Dodo Payments), and cosmetic prices.
- Parked: a classic mode whose interface closely resembles Road Rash's. It is low priority and is not to be planned for now.

## Brand Commitments

- LOWSIDE is the working name, chosen on October 23, 2026. It may still change with the story, so nothing should be built that depends on it. The code and repository still say Rushline. The Lowside is also the bar where the career lives.
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
4. Everything is original, inspired by the concept and never copied from the source. Parody comments on real people; it never copies them.
5. Done means someone played it. Passing tests do not show that it plays well.
