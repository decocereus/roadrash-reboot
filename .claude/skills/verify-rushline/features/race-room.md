# Race room

A race room runs one race for up to eight humans on the `RaceServer` Durable Object in `apps/rooms`. It holds WebSocket seats, steps at 60 Hz and sends every seat each tick. A browser joins with `/?room=<race id>`. `pnpm rooms:race` races scripted seats through the same `openRoomSeat` client the browser uses, each one a real `createRoomClient` over a real WebSocket that predicts, rolls back and compares hashes with the room.

## Sub-features

- `tick-rate` holds 60 Hz: a seat's arrival gaps sit near 16.7 ms and it confirms at least 97% of the expected ticks.
- `agreement` keeps every seat on the room's race: `digestMatched` is true and `desyncs` is 0 with `hashesCompared` above 0.
- `no-late-inputs` accepts a seat's controls in time on a local link: `late` is 0.
- `seat-refusals` sends a ninth seat `refused` with `full` and a seat after the start `refused` with `racing`, and answers a plain request to a seat with 426 and a malformed race ID with 404.
- `own-room` gives each race ID its own room: another race ID reads as a waiting room with no seats while this race runs.
- `dropped-seat` hands a closed seat to the pilot while the others ride on.
- `lobby-hibernation` starts a race after the lobby sat idle longer than the 10 s a Durable Object needs to hibernate.
- `race-end` ends the race and closes every seat with 1000 once every rider is done.
- `browser-race` puts two windowed browsers in one race, each riding its own bike, with the other human on its road.

## Entry points

- `RUSHLINE_WEB_PORT=<port> RUSHLINE_ROOMS_PORT=<port> pnpm exec alchemy dev --stage verify` runs the Worker in local workerd with no Cloudflare login. Use free ports from 1420 up, never 1350 or 1351.
- `pnpm rooms:race --url <rooms url>` races scripted seats and fails on any problem it lists.

## Recipes

Start the Worker and leave it running. `pnpm rooms:race` prints one JSON report and exits non-zero with its `problems`.

- **Tick rate, agreement, inputs, refusals, own room, dropped seat.** Run `pnpm rooms:race --url http://127.0.0.1:<port> --seats 8 --seconds 25 --drop-at-seconds 20`. `problems` is empty. Seven reports show about 1,500 `ticks`, the eighth stops near 1,200 with `closeCode` 1000, `status.seats` lists seven riders each with `late` 0, and `worstBehindTicks` is 1 or 2.
- **Lobby hibernation.** Run `pnpm rooms:race --url http://127.0.0.1:<port> --seats 2 --seconds 10 --lobby-seconds 12`. `problems` is empty. Delete the `rejoin` loop in `race-server.ts` and the same command times out, which shows the room really slept.
- **Race end.** Run `pnpm rooms:race --url http://127.0.0.1:<port> --seats 2 --seconds 400`. It takes a few minutes. Both reports show `ended` true and `closeCode` 1000, and `status.phase` is `waiting`.
- **Two browsers.** Export `VITE_ROOMS_URL=http://127.0.0.1:<rooms port>`, then run `rv up --dev --path "/?room=<id>"` twice with the same `<id>`. Both windows read `2 riders here`. `rv click --run <first> "Start the race"` starts both. Hold `ArrowUp` in each. `globalThis.__rushlineRoom` in each window has `digestMatched` true, a different `me`, and `client.stats.desyncs` 0, and `curl <rooms url>/rooms/<id>` shows `late` 0 for both seats.
- **A finish in the browser.** Add `&autopilot` to both windows. A window with `autopilot` sends no controls, so the room's pilot rides that seat and the window shows the confirmed race. After about 3.6 minutes each window shows the finish banner for its own rider.
- **Host rules without a Worker.** `pnpm exec vitest run --project node apps/rooms` drives `host.ts` with a fake clock: packets, hash agreement, refusals, the four-tick catch-up, leaving and race end.

Reading the numbers: `rollbacks` and `resimulatedTicks` count every remote steer change the client guessed wrong, so scripted weaving seats roll back several times a second by design.

## What this does not prove

- A deployed room. Cloudflare's scheduling, `locationHint` placement and real network lag are untested here. Point `--url` at the deployed Worker to test them.
- How a rollback looks over a real network. On a local link the other rider's largest frame-to-frame sideways move was 7.1 cm over 88 rollbacks.
- A lobby that fills with bots or requeues after a dead room. A seat whose room dies stops at the prediction limit with no message.
