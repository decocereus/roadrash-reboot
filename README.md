# roadrash-reboot

An original multiplayer motorcycle combat racer for desktop browsers. RUSHLINE is the current working title.

The technical proposal and delivery gates are in [docs/architecture.md](docs/architecture.md). The first-playable scope is documented in [docs/first-playable.md](docs/first-playable.md).

## Development

This is a Bun workspace monorepo:

```sh
bun install
```

Run the API and the browser in separate terminals:

```sh
cd apps/edge && bun run dev
```

```sh
cd apps/web && bun run dev
```

Open `http://127.0.0.1:5173`. The browser forwards room API and WebSocket traffic to the local Worker on port 8787. Create a race, share its code, and start it from the host's lobby. Empty seats use bots.

Use Arrow Up or W to accelerate, Arrow Down, S, or Shift to brake, Arrow Left/Right or A/D to steer, Space to strike, and M to mute sound. A solo race starts immediately; an invite race waits for its host. Browser audio starts after a key press.

From the repository root, run:

```sh
bun run check
bun run quality
bun run test:e2e
```

The frontend is a Vite and Three.js app. The edge workspace contains the Cloudflare Worker and Durable Object entrypoints. Shared simulation and protocol code lives under `packages/`.

`bun run check` runs Oxlint with the anti-slop rules, formatting, workspace typechecks, tests, and builds. `bun run quality` also runs Ultracite, the frontend architecture guard, and React Doctor. `bun run test:e2e` starts the local Worker and browser automatically and runs the two-browser Playwright smoke test.

The Cloudflare resource definition is in `infra/alchemy`. `bun run --cwd infra/alchemy plan` builds the web app and previews resources after a Cloudflare provider profile is configured. The first playable has been verified locally; no public deployment or 500-player load test has been done.
