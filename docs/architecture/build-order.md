# Build order

## What is built

| Step | Delivered |
| --- | --- |
| 1 | Faceless-style workspace |
| 2 | Riding greybox: physics, Ridge Road, traffic, crashes, AI pilot, placeholder models, audio |
| 3 | Combat, weapons, a pack of rival riders, police |
| 4 | Art so far: the cel renderer, the five looks, the city and open kits, one bike, three rigged riders, a car, and a van |
| 5 | Career so far: the bikes, the cast of sixteen ordinary riders and six celebrities, race setups, condition and wrecks, grudges, the roads, the career rules, the lines, the save format, the screens, and the browser save |
| — | Jumps, static hazards (oil, rocks, potholes), the performance pass and gate, play-test recording, and the code rules in [coding-standards.md](../coding-standards.md) |

## Launch

Agreed October 23, 2026. Launch needs three finished cities, all six parody celebrities, multiplayer, payments, and sign-in. There is no date. More cities and celebrities come in updates after launch.

The work runs in parallel lanes. Each lane owns its own packages. Every change that edits `RaceState` or `stepRace` stays in the sim lane, one step at a time, because those changes cannot be merged side by side. The screens lane goes first, so every later lane builds on one design language.

| Lane | Owns | Work, in order |
| --- | --- | --- |
| Screens | `apps/web/src/components`, `packages/ui` | The bar-first flow and the neon restyle (in progress); later the sign-in, account, and store screens, and the page that tells a phone visitor to open the game on a desktop |
| Story | `packages/career` text, `docs/design` | A story bible draft that the owner rewrites; then the text in the bar, the results, and the race events |
| Art | `tools/blender`, `tools/art` | Check the commercial licence of each 3D generator; a Ronaldo-parody head as the test, which passes only if the owner recognises him at a glance; the other heads, outfits, and ordinary riders; six bikes with parody brands and their skins; landmark kits per city; pedestrians with walk and fall animations |
| Roads | `packages/track/src/tracks`, `apps/web/src/game` kits | Madrid on the Slag Row shape, Mumbai on the Breakwater Run shape, and the Bay Area on the Ridge Road shape |
| Sim | `packages/sim`, `packages/track` format, `packages/career` rules | The field size as a setting; the multiplayer groundwork (a stable id per rider, input validation, events copied out every tick, a deterministic snapshot and hash); the race director; pedestrians; junctions with red lights; the bike tiers, the three-tier career, and an economy for ten riders |
| Online | the server, `apps/web/src/routes/api`, `apps/rooms` | Multiplayer rooms and the public queue are built (see [Race rooms](race-rooms.md)); still to do: the database host; sign-in; saves on the server, with a guest's career moved over at sign-in; the cosmetics store; the billboard schedule and view counts |
| Launch | everything | A legal review of the cast, the bike brands, the store, and the generated assets; a performance pass on all three cities with full fields; a closed beta in the owner's Discord; deploy |

Each milestone is a play test by the owner:

1. **Madrid slice.** Madrid's road and landmarks, the Ronaldo and Mbappé parodies, ordinary riders, pedestrians, junctions, and the race director, inside the new menus, with placeholder lines.
2. **Mumbai**, with the Ranveer Singh and Jenner parodies.
3. **Bay Area**, with the Musk and Altman parodies. All six celebrities are in.
4. **Multiplayer**: a race with a few friends, signed in.
5. **Closed beta**, with the store and the billboards live.
6. **Launch.**
