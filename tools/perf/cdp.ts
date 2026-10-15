import { once } from "node:events";

import { Schema } from "effect";

const envelope = Schema.Struct({
  error: Schema.optionalKey(Schema.Struct({ message: Schema.String })),
  id: Schema.optionalKey(Schema.Number),
  method: Schema.optionalKey(Schema.String),
  params: Schema.optionalKey(Schema.Unknown),
  result: Schema.optionalKey(Schema.Unknown),
});

const decodeEnvelope = Schema.decodeUnknownSync(envelope);

type Envelope = typeof envelope.Type;

export type ParamValue =
  | string
  | number
  | boolean
  | readonly ParamValue[]
  | CommandParams;

export interface CommandParams {
  readonly [name: string]: ParamValue;
}

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

  const request = (
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
    return promise;
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
      list.push((message) => listener(decode(message.params)));
      listeners.set(method, list);
    },
    async send(method, params = {}) {
      await request(method, params);
    },
  };
};

const evaluated = Schema.Struct({
  exceptionDetails: Schema.optionalKey(
    Schema.Struct({
      exception: Schema.optionalKey(
        Schema.Struct({ description: Schema.optionalKey(Schema.String) })
      ),
      text: Schema.String,
    })
  ),
  result: Schema.Struct({ value: Schema.optionalKey(Schema.Unknown) }),
});

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
