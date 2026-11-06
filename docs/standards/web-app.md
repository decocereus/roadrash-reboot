# Web app standards

Rules for the React app in `apps/web/src` outside `game/`, and for `packages/ui`. The core rules in [coding-standards.md](../coding-standards.md) apply too.

## Keep each module to its job

| Rule | Check | Scope | Exemption |
| --- | --- | --- | --- |
| The handoff from preparing a race to riding it is decided in the transition tables in `apps/web/src/race-handoff.ts` and `apps/web/src/room-handoff.ts`. `RideOut` and `SeatedLobby` run the effects those tables return and keep no flag or ref of their own that says how far the handoff has got. A timer they start belongs to an effect that clears it, and that cleanup sends the table no event, because React re-runs effect cleanups in a development build. | judgment | `apps/web/src/race-handoff.ts`, `apps/web/src/room-handoff.ts`, `apps/web/src/components/game-shell.tsx`, `apps/web/src/components/room-lobby.tsx` | None |
| Which screen the app shows is decided in `stepNavigation` in `apps/web/src/navigation.ts`, which takes an event and returns the next `View` and at most one effect. `useFlow` runs the effects and `GameShell` sends events; neither holds a flag or ref that says what screen or race stage the app is in. A race's stage lives in its `View` with the report it carries. The race session, the handoffs and the save stay in their own machines, and navigation learns about them through events. | judgment | `apps/web/src/navigation.ts`, `apps/web/src/components/use-flow.ts`, `apps/web/src/components/game-shell.tsx` | None |
| No static value import from React reaches `apps/web/src/game` or the `three` package; React imports their types with `import type` and loads the game through the literal dynamic imports in `apps/web/src/asset-load.ts`. The check starts at every `apps/web/src/**/*.tsx` file, resolves each import with the client build's Vite resolver, and follows value imports, value re-exports, side-effect imports and CommonJS `require` through every module, first-party or installed, before tree shaking. It judges a module by its real path, or by the package that owns it, and prints the chain of imports, with line numbers, to each crossing. An import it cannot resolve, a file it cannot parse, or a dynamic import of a computed specifier is an error. | `pnpm check:renderer-imports` | `apps/web/src/**/*.tsx` and every module they import statically | None |

## Write player text in the game's voice

| Rule | Check | Scope | Exemption |
| --- | --- | --- | --- |
| Player text never says AI, and uses no em dash and no middle dot as a separator. The other riders are street riders, and a rider the room rides for after a drop looks like anyone else, so no screen marks them. Separate parts with a comma or plain words. The owner set this on November 6, 2026, after the rejoin screens and again after the queue screen said `labelled AI`. The rule reads the text a player sees: JSX text and JSX attribute strings with their HTML entities decoded, and string literals and template text with their escapes decoded. It cannot judge tone or jargon, such as `server` or `Catch-up`; review checks those against the street-crew voice. | `rushline/player-copy` | `apps/web/src/components/**`, `apps/web/src/routes/**/*.tsx`, `apps/web/src/career/copy.ts`, `apps/web/src/game/hud.ts`, `apps/web/src/game/race-feedback.ts`, `apps/web/src/career/notes.ts`, `apps/web/src/game/bar-signs.ts` | None |
