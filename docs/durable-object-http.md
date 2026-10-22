# Durable Object HTTP conventions

Rushline has no multiplayer and no Durable Object today. These are the conventions for the planned race service, written down before its first line of code. They describe nothing that is deployed. [architecture.md](architecture.md) plans one Durable Object per race running the same simulation, and [coding-standards.md](coding-standards.md) keeps Effect at boundaries such as this one.

## Boundary and ownership

- Treat the race Durable Object as an HTTP service: it answers `fetch` through an Effect HTTP API (`HttpApi`, `HttpApiBuilder` and `HttpApiClient` from `effect/http-api`). Do not call it through Alchemy's typed RPC.
- The boundary is logical. It holds even when the caller and the object run in the same Cloudflare runtime.
- The HTTP adapter and Effect stay at the boundary. `packages/sim` stays plain deterministic TypeScript, and the server advances a race with `stepRace` as the browser does.
- These conventions do not decide how a player's inputs reach the race in real time. They do not require an HTTP request per tick, and they do not choose WebSockets, a lobby, accounts or reconnection.

## Contract and names

- The server and the client generated from it share one typed contract for requests, responses and errors. External input is validated once, at that boundary.
- The names follow their roles. `IRaceClient` is the interface the application sees, `RaceClient` is the contextual Effect service that implements it, and `RaceServer` is the Alchemy Durable Object (`Cloudflare.DurableObject`) that serves the HTTP API. These names show the roles; do not create them before the race service is designed.
- Game and application code yield `RaceClient` and call its domain methods. They never receive a namespace, a stub or a generated HTTP client. The interface has no stub resolver and no instance-bound `forRace` facade.

## Identity and private plumbing

- An instance is looked up by the race's stable, branded canonical ID, never by a road name, track slug, lobby title or display label. How that ID is generated and encoded belongs to the multiplayer design.
- Namespace bindings, stubs and `Cloudflare.toHttpClient` (`alchemy/src/Cloudflare/Fetcher.ts`) stay inside composition roots and client implementations.
- A client constructor yields its Alchemy Durable Object service and closes over the namespace. Do not write a namespace interface by hand, and do not pass a namespace through application Layers.

## Invocation lifetime

- A namespace may be resolved while Alchemy initialises. A stub and its generated HTTP client are built inside the current Worker or Durable Object invocation, and are never kept in an isolate global or across invocations. The canonical ID selects the instance; it does not carry the caller's I/O context into the next invocation.
- Build the client with Alchemy's `makeExecutionMemo` (`alchemy/src/Runtime/ExecutionMemo.ts`) around a suspended lookup, so planning never touches a binding that exists only at runtime.
- When one invocation can address several races, the memo holds an Effect `Cache` keyed by canonical race ID, which joins concurrent first lookups. With exactly one fixed target, memoize that single suspended client and use no cache.
- An isolate-scoped Layer, `Layer.suspend`, `Layer.unwrap` or a global cache does not give this lifetime. The resolver stays private to the client.

## Routes and failures

- The server composes its router (`HttpRouter` from `effect/http`) for the life of the Durable Object instance and handles each `fetch` through the declared contract.
- Routes carry no version prefix such as `/v1` and no compatibility aliases; the owner chose no legacy routes when these rules were planned. Do not name endpoints before the race service is designed.
- Each domain refusal is declared in the contract with its HTTP status, the way `statusOf` maps each telemetry refusal in `apps/web/src/server/telemetry.ts`. Follow [errors.md](errors.md): a fixed public message, and the cause kept internally.
- Do not copy `orDie`, which `rushline/no-swallowed-failure` bans, blanket exception hiding or an unconditional retry from reference code. Whether a mutation may be retried depends on what it means in the race, and is decided with it.

## Proof

The first multiplayer change proves these conventions through the real HTTP contract: `fetch` and the generated client with service Layers, routing by canonical ID, each typed failure with its status, and two invocations that cannot share the first one's stub-backed client. Those tests arrive with that code. Nothing is added before it.

## Sources

The rules on ownership, naming, identity and invocation lifetime come from cf-workflow-pool's [Durable Object HTTP boundary](https://github.com/dmmulroy/cf-workflow-pool/blob/73e0f2f5d3b72d85a17384638716c4b0490e16aa/docs/coding-standards.md#durable-object-http-boundary). Its `/v1` rule is left out, and so are its imports from the `effect` root, which `no-restricted-imports` bans here. Look up each API in the installed Effect 4.0.0 and Alchemy source, as [coding-standards.md](coding-standards.md) says, rather than copy examples written for another version.
