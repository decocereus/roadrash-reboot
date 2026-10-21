import { once } from "node:events";

import * as Schema from "effect/Schema";

import { decodeEnvelope, evaluated } from "./cdp-protocol.ts";
import type { CommandParams, Envelope } from "./cdp-protocol.ts";

interface Waiting {
  readonly settle: (message: Envelope) => void;
  readonly fail: (error: Error) => void;
}

export interface Session {
  readonly call: <T>(
    method: string,
    params: CommandParams,
    schema: Schema.ConstraintDecoder<T>
  ) => Promise<T>;
  readonly send: (method: string, params?: CommandParams) => Promise<void>;
  readonly on: <T>(
    method: string,
    schema: Schema.ConstraintDecoder<T>,
    listener: (value: T) => void
  ) => void;
  readonly close: () => void;
}

export const connect = async (url: string): Promise<Session> => {
  const socket = new WebSocket(url);
  await once(socket, "open");
  const waiting = new Map<number, Waiting>();
  const listeners = new Map<string, ((message: Envelope) => void)[]>();
  let nextId = 1;

  socket.addEventListener("message", (event) => {
    const message = decodeEnvelope(JSON.parse(String(event.data)));
    if (message.id !== undefined) {
      waiting.get(message.id)?.settle(message);
      waiting.delete(message.id);
      return;
    }
    for (const listener of listeners.get(message.method ?? "") ?? []) {
      listener(message);
    }
  });
  socket.addEventListener("close", () => {
    for (const each of waiting.values()) {
      each.fail(new Error("The DevTools connection closed."));
    }
    waiting.clear();
  });

  const request = async (
    method: string,
    params: CommandParams
  ): Promise<Envelope> => {
    const id = nextId;
    nextId += 1;
    const { promise, resolve, reject } = Promise.withResolvers<Envelope>();
    waiting.set(id, {
      fail: reject,
      settle(message) {
        if (message.error) {
          reject(new Error(`${method}: ${message.error.message}`));
        } else {
          resolve(message);
        }
      },
    });
    socket.send(JSON.stringify({ id, method, params }));
    return await promise;
  };

  return {
    async call(method, params, schema) {
      const message = await request(method, params);
      return Schema.decodeUnknownSync(schema)(message.result);
    },
    close() {
      socket.close();
    },
    on(method, schema, listener) {
      const decode = Schema.decodeUnknownSync(schema);
      const list = listeners.get(method) ?? [];
      list.push((message) => {
        listener(decode(message.params));
      });
      listeners.set(method, list);
    },
    async send(method, params = {}) {
      await request(method, params);
    },
  };
};

export const evaluate = async <T>(
  session: Session,
  expression: string,
  schema: Schema.ConstraintDecoder<T>
): Promise<T> => {
  const answer = await session.call(
    "Runtime.evaluate",
    { awaitPromise: true, expression, returnByValue: true },
    evaluated
  );
  if (answer.exceptionDetails) {
    const { exception, text } = answer.exceptionDetails;
    throw new Error(`${expression}: ${exception?.description ?? text}`);
  }
  return Schema.decodeUnknownSync(schema)(answer.result.value);
};
