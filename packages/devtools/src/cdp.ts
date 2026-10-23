import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import { flow } from "effect/Function";
import * as Predicate from "effect/Predicate";
import * as Schema from "effect/Schema";
import type * as Scope from "effect/Scope";
import * as Socket from "effect/socket/Socket";

import { CdpError } from "./cdp-error.ts";
import { decodeMessage, evaluated } from "./cdp-protocol.ts";
import type { CommandParams, Envelope } from "./cdp-protocol.ts";

const CLOSED = "The DevTools connection closed.";

type Listener = (message: Envelope) => Effect.Effect<void, CdpError>;

export interface Session {
  readonly call: <T>(
    method: string,
    params: CommandParams,
    schema: Schema.ConstraintDecoder<T>
  ) => Effect.Effect<T, CdpError>;
  readonly send: (
    method: string,
    params?: CommandParams
  ) => Effect.Effect<void, CdpError>;
  readonly on: <T>(
    method: string,
    schema: Schema.ConstraintDecoder<T>,
    listener: (value: T) => void
  ) => Effect.Effect<void, never, Scope.Scope>;
  readonly once: <T>(
    method: string,
    schema: Schema.ConstraintDecoder<T>
  ) => Effect.Effect<Effect.Effect<T, CdpError>, never, Scope.Scope>;
  readonly closed: Effect.Effect<never, CdpError>;
}

const textOf = (chunk: Uint8Array | string): string =>
  Predicate.isString(chunk) ? chunk : new TextDecoder().decode(chunk);

const decoderFor = <T>(
  schema: Schema.ConstraintDecoder<T>,
  method: string,
  operation: string
) =>
  flow(
    Schema.decodeUnknownEffect(schema),
    Effect.mapError(
      (cause) =>
        new CdpError({
          cause,
          message: cause.message,
          method,
          operation,
        })
    )
  );

export const connect = Effect.fn("cdp.connect")(function* connect(url: string) {
  const socket = yield* Socket.makeWebSocket(url);
  const reader = yield* socket.reader.pipe(
    Effect.mapError(
      (cause) =>
        new CdpError({
          cause,
          message: `Could not open DevTools at ${url}: ${cause.message}`,
          operation: "connect",
        })
    )
  );
  const writer = yield* socket.writer;
  const pending = new Map<number, Deferred.Deferred<Envelope, CdpError>>();
  const listeners = new Map<string, Set<Listener>>();
  const terminal = yield* Deferred.make<never, CdpError>();
  const closed = Deferred.await(terminal);
  let nextId = 1;

  const dispatch = Effect.fnUntraced(function* dispatch(message: Envelope) {
    if (message.id !== undefined) {
      const waiting = pending.get(message.id);
      pending.delete(message.id);
      if (waiting) {
        yield* Deferred.succeed(waiting, message);
      }
      return;
    }
    for (const listener of listeners.get(message.method ?? "") ?? []) {
      yield* listener(message);
    }
  });

  const pulled = reader.pull.pipe(
    Effect.mapError(
      (cause) => new CdpError({ cause, message: CLOSED, operation: "read" })
    ),
    Effect.flatMap((chunks) =>
      Effect.all(
        chunks.map((chunk) =>
          decodeMessage(textOf(chunk)).pipe(
            Effect.mapError(
              (cause) =>
                new CdpError({
                  cause,
                  message: `DevTools sent an unreadable message: ${cause.message}`,
                  operation: "read",
                })
            ),
            Effect.flatMap(dispatch)
          )
        ),
        { discard: true }
      )
    )
  );

  yield* Effect.forkScoped(
    Effect.forever(pulled).pipe(
      Effect.catchCause((cause) => Deferred.failCause(terminal, cause))
    )
  );

  const request = (method: string, params: CommandParams) =>
    Effect.suspend(() => {
      const id = nextId;
      nextId += 1;
      return Effect.gen(function* awaitReply() {
        const reply = yield* Deferred.make<Envelope, CdpError>();
        pending.set(id, reply);
        yield* writer.write(JSON.stringify({ id, method, params })).pipe(
          Effect.mapError(
            (cause) =>
              new CdpError({
                cause,
                message: `${method}: ${cause.message}`,
                method,
                operation: "send",
                requestId: id,
              })
          )
        );
        const message = yield* Deferred.await(reply).pipe(
          Effect.raceFirst(closed)
        );
        if (message.error) {
          return yield* new CdpError({
            message: `${method}: ${message.error.message}`,
            method,
            operation: "call",
            requestId: id,
          });
        }
        return message;
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            pending.delete(id);
          })
        )
      );
    });

  const on = <T>(
    method: string,
    schema: Schema.ConstraintDecoder<T>,
    listener: (value: T) => void
  ) => {
    const decode = decoderFor(schema, method, "event");
    const entry: Listener = (message) =>
      decode(message.params).pipe(
        Effect.flatMap((value) =>
          Effect.sync(() => {
            listener(value);
          })
        )
      );
    return Effect.acquireRelease(
      Effect.sync(() => {
        const list = listeners.get(method) ?? new Set<Listener>();
        list.add(entry);
        listeners.set(method, list);
      }),
      () =>
        Effect.sync(() => {
          listeners.get(method)?.delete(entry);
        })
    );
  };

  const once = <T>(method: string, schema: Schema.ConstraintDecoder<T>) =>
    Effect.gen(function* subscribeOnce() {
      const arrived = yield* Deferred.make<T>();
      yield* on(method, schema, (value) => {
        Deferred.doneUnsafe(arrived, Effect.succeed(value));
      });
      return Deferred.await(arrived).pipe(Effect.raceFirst(closed));
    });

  const session: Session = {
    call: (method, params, schema) =>
      request(method, params).pipe(
        Effect.flatMap((message) =>
          decoderFor(schema, method, "call")(message.result)
        )
      ),
    closed,
    on,
    once,
    send: (method, params = {}) => Effect.asVoid(request(method, params)),
  };
  return session;
});

export const evaluate = <T>(
  session: Session,
  expression: string,
  schema: Schema.ConstraintDecoder<T>
): Effect.Effect<T, CdpError> =>
  session
    .call(
      "Runtime.evaluate",
      { awaitPromise: true, expression, returnByValue: true },
      evaluated
    )
    .pipe(
      Effect.flatMap((answer) => {
        if (answer.exceptionDetails) {
          const { exception, text } = answer.exceptionDetails;
          return Effect.fail(
            new CdpError({
              message: `${expression}: ${exception?.description ?? text}`,
              method: "Runtime.evaluate",
              operation: "evaluate",
            })
          );
        }
        return decoderFor(
          schema,
          "Runtime.evaluate",
          "evaluate"
        )(answer.result.value);
      })
    );
