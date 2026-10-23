import { TaggedError as TaggedErrorClass } from "effect/Schema";

export class NoStore extends TaggedErrorClass<NoStore>()("NoStore", {}) {}
