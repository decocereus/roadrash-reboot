# Game art

Every model and menu picture the player sees comes from the art store, not from the game bundle. The bar's plates, the rivals, flyers and stickers, and every bike, rider, car and van load from `/art/<key>` on the game's own origin, where the key is the file's content hash. A deployed game reads them from the R2 bucket; a local build reads them from the shared cache at `~/.cache/rushline/art` and fills it from the deployed game.

## Sub-features

- `art-route` answers `/art/<key>` with the file, its content type and an immutable cache header, and a key it does not hold with an uncached 404.
- `bar-art` shows the bar, its plates and the rival figures with every picture from `/art/`.
- `race-art` loads the boot models and a race's riders from `/art/`, with no art under `/assets/`.
- `read-through` refills a cache that lacks a key from the deployed game.
- `deployed` serves the same art from R2 at https://rushline.amartya-faceless.workers.dev.

## How to get to it (user POV)

- Load the site. The bar paints its plates and figures before the menu answers.
- Ride any race from the Clubhouse or the Back Room. The grid's bikes and riders are models.
- Open the deployed game at https://rushline.amartya-faceless.workers.dev from any browser.

## Driving it with rv

Preconditions:

- `rv doctor --run <run>` passes on a slot started with a fresh profile, or, for `deployed`, a slot started with `rv up --server https://rushline.amartya-faceless.workers.dev/ --user-asked` when the owner asked for the deployed check.
- The slot's port, printed by `rv up`, is `<port>` below.

- **Art route.** Run `node -p 'require("./apps/web/src/assets/art.json")["models/bike.glb"]'` for a key, then `curl -sI http://127.0.0.1:<port>/art/<key>`. The answer is `200` with `content-type: model/gltf-binary` and `cache-control: public, max-age=31536000, immutable`. `curl -sI http://127.0.0.1:<port>/art/00000000000000000000000000000000.glb` answers `404`, and `curl -sI http://127.0.0.1:<port>/art/bike.glb` answers `404`.
- **Bar art.** Run `rv open --run <run> / --until bar`, then `rv shot --run <run> bar-art`. The plates, the counter and the rival figures are painted. `rv js --run <run> 'performance.getEntriesByType("resource").filter((e) => /\.(webp|glb)$/u.test(e.name)).every((e) => new URL(e.name).pathname.startsWith("/art/"))'` prints `true`.
- **Race art.** Run `rv open --run <run> "/?ride=breakwater-run&at=3700&autopilot" --until race`, then `rv shot --run <run> race-art`. The bikes, riders, cars and vans are drawn. `rv js --run <run> 'performance.getEntriesByType("resource").filter((e) => e.name.endsWith(".glb")).map((e) => new URL(e.name).pathname.split("/")[1])'` lists only `art`. Ride a Madrid stretch the same way with `?ride=madrid-gran-via` in a development build.
- **Read-through.** Move one key out of the cache with `mv ~/.cache/rushline/art/<key> /tmp/`, then `curl -so /dev/null -w "%{http_code}" http://127.0.0.1:<port>/art/<key>`. It answers `200`, and the file is back in `~/.cache/rushline/art`.
- **Deployed.** On the deployed slot, run the bar and race steps with `--until bar` and `--until race`, and `rv console --run <run> errors`. Every `.glb` and `.webp` path starts with `/art/` and the console has no errors.

## Gotchas

- `pnpm art:stage` writes the cache before `pnpm art:upload` puts the file in R2, so a local build shows new art that the deployed game and CI cannot fetch yet. Run `pnpm art:upload` before you push.
- The cache is shared by every worktree. Deleting it only costs a download, but deleting a file that was staged and never uploaded loses it.
- `?ride=madrid-*` stretches are development-only, so the deployed game cannot ride them by URL.
