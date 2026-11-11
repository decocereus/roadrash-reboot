# Game art

Models are not committed, and since November 11, 2026 the menus use no art of their own. Each file lives in the R2 bucket `rushline-art` under a content-addressed key, the first 32 hex digits of its SHA-256 and its extension, such as `d86d4b875dd46f911b288f42bc7a68cb.glb`. `apps/web/src/assets/art.json` is the manifest. It maps each logical name, such as `models/bike.glb` or `models/van.glb`, to its key, and `artUrl` in `apps/web/src/assets/art.ts` turns a name into `/art/<key>`. A name that is not in the manifest does not type-check. A changed file gets a new key, so its URL changes and nothing needs purging.

The Worker serves `/art/<key>` from the bucket with `cache-control: public, max-age=31536000, immutable` (`apps/web/src/routes/art/$key.ts` and `apps/web/src/server/art.ts`). The art stays on the game's own origin: the account's only zone belongs to another product, and the same origin needs no CORS for WebGL textures. `r2.dev` is rate-limited and not used.

In `pnpm dev`, `vite preview`, the verify tool and the perf tools, a middleware in `apps/web/vite.config.ts` serves `/art/<key>` from a cache at `~/.cache/rushline/art`, which every worktree on the machine shares. A key missing from the cache is downloaded from the deployed Worker, checked against its hash and kept, so dev works offline once each file has been seen.

| Step | Command |
| --- | --- |
| Add or replace art | `pnpm art:stage <name>=<file> ...` hashes each file into the cache and writes its key into the manifest. `node tools/blender/compress.ts` stages the models it compresses the same way. |
| Publish it | `pnpm art:upload` puts every manifest key the bucket lacks, from the cache, and skips keys it already holds. It uses the Alchemy login (`alchemy profile`), or `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` when they are set. Run it before you push: CI downloads art from the deployed Worker and fails on a key the bucket lacks. |
| Fill the cache | `pnpm art:pull` downloads every key the cache lacks. `pnpm perf` and the `vite` test project do this themselves, and the tests that parse the real models read them from the cache through `apps/web/test/art-files.ts`. |

`pnpm check:art` fails when a game binary (a model, image, sound, video or font file) is committed outside `docs/`, and when the manifest holds a key that is not a content hash. The review images under `docs/art` stay in git: they are design records that the READMEs beside them show, and the player never downloads them.

Blender 5.2 with the MPFB add-on builds the models. The scripts in `tools/blender` model the bike and vehicles from code, take the rider's body from MPFB, pose it, and export GLB. For launch, heads, outfits, and landmark props are generated with Hunyuan3D or Hyper3D Rodin through the Blender MCP, then cut down, rigged, and given the cel materials by the same scripts.
