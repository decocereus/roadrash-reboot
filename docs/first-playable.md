# First playable race

Status: first local playable verified on 2026-09-24; River City visual pass added on 2026-09-25; gameplay corrections in progress on 2026-09-28. This is the scope and evidence for the current build. It has not been deployed.

## Intent

Keep the arcade rhythm of the Windows/3DO Road Rash games: ride fast, thread through traffic, fight riders beside you, lose time in a crash, and get back into the race. Use original code, art, riders, sounds, and branding. Real-world parody riders, more weapons, progression, and final art come after this race is fun and stable.

The [3DO manual](https://www.digitpress.com/library/manuals/3do/road_rash.pdf) documents separate riding controls, nearby punch and kick attacks, stamina, and knockdowns. The [Genesis manual](https://oldgamesdownload.com/wp-content/uploads/Road_Rash_Manual_Genesis_EN.pdf) documents traffic and roadside hazards. Those mechanics guide the first race; we will not copy either game's assets or text.

## Player flow

1. Open the site, enter a nickname, and create a private race or join one through its room link.
2. Fill four starting spots with human players and server-controlled riders. One person can therefore start and finish a race alone; up to four people can ride together.
3. Ride a short road with throttle, braking, and steering. Traffic creates passing and collision decisions. One close-range attack can disrupt a nearby rival and has a cooldown.
4. A hard collision or enough damage causes a visible crash and a brief recovery, then the rider continues. The race ends when riders finish or a clear timeout resolves the result. The server decides hits and finish order.
5. Show the same standings to every connected player. Offer a replay or new room after the result.

## Controls and feedback

- Arrow keys or WASD steer, accelerate, and brake. Space attacks. M toggles sound.
- The chase camera, road motion, bike lean, speed display, opponent placement, impact flash, crash pose, and short sound cues must make each action legible.
- The current race uses original rear-view rider and traffic sprites on a curved Three.js road. Synthesized sound cues remain in place.

## River City visual pass

- The chase camera now follows a bending, four-lane city road with asphalt texture, lane paint, curbs, sidewalks, storefronts, trees, and streetlights. Daylight and distance fog replace the dark prototype scene.
- The player has separate riding and right-punch poses. Three rivals have different helmets and jackets. A rear-view sedan represents traffic. These are original transparent sprites placed in the 3D scene, not GLB models.
- The race HUD now shows compact position, speed, rider health, and course progress. The large decorative speedometer and speed-derived RPM readout were removed on September 28. The start screen frames the city race without covering the rider.
- The scene is a 2.5D visual slice. Bikes and cars always face the chase camera; they do not yet have side views, articulated animation, or 3D collision shapes matching their art. Storefront repetition and sparse roadside activity remain visible. The next art pass should replace the hero rider, nearest rival, and traffic car with consistent multi-view models or sprites, then add crash and contact frames. Preserve the current server-owned race rules.

Compare the [current playable frame](art/river-city-playable-frame.jpg) with the [art direction concept](art/city-race-concept.webp). The playable-frame capture shows the Three.js canvas only; the dashboard is a separate page layer.

## Gameplay correction pass, 2026-09-28

- The shared race simulation remains an arcade, road-relative model. It is not rigid-body motorcycle physics. Acceleration, braking, and steering were slowed to avoid instant top speed and lane snapping; steering now has short lateral carry after a key release.
- A stationary overlap no longer knocks down a rider. Low-speed side contact slows bikes; hard rider and traffic impacts still crash. Rear impacts identify the striking rider from positions before the simulation step, so an overtake within one tick does not reverse the collision result. Bots avoid riders earlier and steer inward at the road edge.
- Server snapshots still arrive at 10 Hz from a 30 Hz room simulation. The browser now preserves continuous lateral position and extrapolates between snapshots for rendering. The chase camera follows the player's forward progress directly so the bike does not appear to shrink while accelerating.
- Three.js currently draws road geometry, lane paint, lights, camera, fog, and image planes for buildings and trees. Bikes and cars remain camera-facing image sprites. There is no imported 3D motorcycle, rider, or traffic mesh, no rigged rider or wheel animation, and no art-matched collision shape. These are the largest remaining visual and gameplay gaps. The next asset milestone is one original hero bike and rider with rear and side silhouettes, lean, attack, and crash motion, plus one car, reviewed in the running chase camera. Scenario skills may help generate candidates, but candidates still need mesh cleanup, pivots, materials, rigging, and animation before integration.

## Technical boundaries

- Vite and React own the page, room flow, HUD, and results. Three.js owns the race render loop.
- A shared TypeScript package owns race rules. A Cloudflare Durable Object owns each room and advances its race. Browsers send controls; the room sends state and events.
- Effect parses external messages and models room/API errors. Alchemy defines the Cloudflare resources. The first build runs locally through Vite and a local Worker; the deployment definition must also be present.
- Four riders is the first room limit. The 500-player concurrent load test in the [architecture plan](architecture.md) is a later capacity gate, not part of this acceptance test.

## Verification

- Playwright completed a solo browser race against three bots and showed the server result. A second test joined two browser contexts to one room, started through the host's visible button, and checked that both finish screens displayed all four riders in server-ranked order with the correct local-rider marker. Both tests passed again after the River City visual pass.
- The original eight simulation tests covered steering, traffic, close-range hit and cooldown, crash recovery, crossing order, and the 60-second deadline. Four Effect protocol tests covered valid and invalid messages. Room code review confirmed that disconnect clears held input and that newer connections replace older sockets without losing the new input stream. The September 28 test count is recorded below.
- `bun install --frozen-lockfile` and `bun run quality` passed. Quality runs Oxlint with the anti-slop rules, Oxfmt, typechecks, unit tests, the production browser build, Ultracite, the frontend architecture guard, and React Doctor. The rendered scene and desktop and 390 px mobile layouts were inspected in the local preview; the browser tests exercised controls, room flow, and results.
- The road geometry and sound cues are original procedural work. The rider, car, building, tree, and surface images are newly generated original assets. There are no Road Rash assets or public-figure likenesses.
- On 2026-09-28, `bun run quality` passed again with 15 simulation tests and four protocol tests. `bun run test:e2e` passed both the solo race and the two-browser room race after the gameplay and terminal-broadcast changes. A T3 browser preview confirmed the smaller HUD and stable chase-camera framing during play. The first two-browser run exposed the missing terminal screen before the broadcast-order fix; the targeted retest and full rerun passed afterward. No measured frame-rate or real-network latency result exists yet.

The Alchemy plan builds the site but stops at Cloudflare profile configuration. No Cloudflare resources have been created. Network latency, deployed reconnect behavior, input flood handling, and 500-player capacity still need staging tests. A result-storage failure can still prevent D1 persistence until a later room wake; terminal UI delivery now happens first, but durable retry remains separate work.

## Deferred decisions

Set the final game name, cast, detailed weapons, track roster, career progression, accounts, monetization, mobile controls, and 500-player capacity after the first race is working. Decide where parody is recognizable only after reviewing each exact character and intended market.
