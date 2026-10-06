# Rushline

An original motorcycle combat racer for desktop browsers. RUSHLINE is the working title. See [docs/architecture.md](docs/architecture.md) for the design and build order.

## Setup

Use Node 24 or newer and pnpm 11.21.0.

```sh
pnpm install --frozen-lockfile
pnpm dev      # web app at http://localhost:1350
pnpm check
pnpm build
```

`pnpm dev` needs no Cloudflare account.

## Controls

| Action        | Keys                 | Gamepad       |
| ------------- | -------------------- | ------------- |
| Throttle      | `W` or `↑`           | Right trigger |
| Brake         | `S`, `↓`, or `Space` | Left trigger  |
| Lean          | `A` `D` or `←` `→`   | Left stick    |
| Start         | `Enter`              |               |
| Restart, mute | `R`, `M`             |               |

## Layout

```text
alchemy.run.ts     Alchemy stack: the composition root
apps/web/          TanStack Start shell and the Three.js game client
packages/sim/      Deterministic riding, traffic, crash, and AI rules
packages/track/    Track format, compilation, and Ridge Road
packages/ui/       shadcn components and global styles
docs/              Architecture and build order
tools/             Custom Oxlint rules
```
