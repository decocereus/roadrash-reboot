# Rushline architecture

Agreed October 6, 2026. This replaces the first prototype, a server-driven lane model with sprite riders. That code is kept in commit `2ba657f`.

## Product

An original motorcycle combat racer for desktop browsers, in the spirit of the mid-1990s Road Rash games: fast point-to-point road races, oncoming traffic, fights between riders, and crashes that throw you off the bike. It launches free, with the career, single races, and multiplayer together. The world is a near-future version of the real one: illegal road races streamed around the world, through real cities with a cyberpunk twist, against parodies of real celebrities. The name, tracks, bikes, riders, art, and audio are our own; LOWSIDE is the working name and the code still says Rushline. "Road Rash" is an Electronic Arts trademark and nothing of theirs is used. `PRODUCT.md` and section 0 of `docs/design/game-design.md` have the launch direction agreed on October 23, 2026.

The art direction is cel-shaded cyberpunk anime: two flat tones, ink outlines, neon signs, and a palette of yellow, cyan, magenta, and red on near-black. Proportions are realistic, for the world, the bikes, and the riders. The look was accepted on October 13, 2026 as the base to build on. Colours, faces, and outfits get refined after the rest of the game exists.

## Platform

| Concern | Choice |
| --- | --- |
| Infrastructure as code | Alchemy v2, pinned to the npm beta 2.0.0-beta.83 |
| Web app | TanStack Start on Cloudflare Workers, shadcn components in `packages/ui` |
| Rendering | Three.js on WebGL 2 |
| Simulation | Plain TypeScript in `packages/sim`, fixed 60 Hz, running in the browser |
| Server runtime | Effect 4.0.0 on Workers, when a server feature exists |
| Multiplayer | One Durable Object per race running the same simulation, in the `Rooms` Worker (`apps/rooms`) |
| Accounts | Sign-in with Discord, Google, or an emailed link; no passwords |
| Payments | Polar or Dodo Payments, both merchants of record; not chosen |
| Tooling | pnpm, TypeScript 7 checked by tsrs, Oxlint with the anti-slop rules, Oxfmt through Ultracite, Vitest |

The game is deployed as one Worker named `rushline`, at https://rushline.amartya-faceless.workers.dev, from the `prod` stage of `alchemy.run.ts`. The stack also declares the R2 bucket `rushline-art`, which the Worker reads through its `ART` binding. How the game deploys, from CI and by hand, is in [architecture/deploy.md](architecture/deploy.md).

There is no database yet. Accounts, saves on the server, the store, and billboard view counts bring them in before launch. Where the database is hosted is decided on cost and is open; Cloudflare D1 is not assumed. A guest's career stays in the browser, and signing in moves it to the server.

## Areas

Each area has its own file under `docs/architecture/`. Read the one for the code you change; `AGENTS.md` maps paths to them, and `docs/feature-map.md` links each feature to its section.

| Area | File |
| --- | --- |
| Riding, crashes, combat, police and hazards in `packages/sim` | [riding-model.md](architecture/riding-model.md) |
| `createRace`, the cast, the bike and rider tables, and the race snapshot | [race-setup.md](architecture/race-setup.md) |
| Multiplayer race rooms and the `apps/rooms` Durable Object | [race-rooms.md](architecture/race-rooms.md) |
| `packages/track`: plans, pieces, districts, junctions and crossings | [tracks.md](architecture/tracks.md) |
| `packages/career`: money, tiers, the shop, the field draw and the save | [career.md](architecture/career.md) |
| `apps/web`: the renderer, the frame loop, menus, the HUD and the bar lobby | [browser-client.md](architecture/browser-client.md) |
| Models in R2, and how Blender builds them | [game-art.md](architecture/game-art.md) |
| The deploy workflow, the production environment and its token | [deploy.md](architecture/deploy.md) |
| What is built, the launch lanes and the milestones | [build-order.md](architecture/build-order.md) |

## Local development

`pnpm dev` runs `alchemy dev` with local state in `.alchemy/` and needs no Cloudflare account. The web app is at `http://localhost:1350`.

Alchemy is installed from npm, pinned to 2.0.0-beta.83 in `package.json`, which supports Effect 4.0.0.
