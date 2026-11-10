import type * as THREE from "three";

import type { Tag, TagLayer } from "./bar-tags.ts";

const AMBIENT = [
  "RACE NEXT?",
  "LOBBY LOOKS SICK!",
  "SAME!",
  "NICE BIKE",
] as const;
const SPOKEN = [
  "YO",
  "SUP",
  "WATCH IT!",
  "OI!",
  "NICE! PRESS B FOR YOUR BIKE",
] as const;
type BarLine = (typeof SPOKEN)[number];
const LINE_SECONDS = 2.2;
const AMBIENT_SECONDS = 4;

interface Speaking {
  readonly tag: Tag;
  head: THREE.Vector3 | null;
  until: number;
}

export interface BarSpeech {
  readonly say: (line: BarLine, head: THREE.Vector3, time: number) => void;
  readonly ambient: (turn: number, head: THREE.Vector3, time: number) => void;
  readonly update: (
    time: number,
    camera: THREE.Camera,
    size: { readonly width: number; readonly height: number }
  ) => void;
}

export const createSpeech = (tags: TagLayer): BarSpeech => {
  const speakingOf = (line: string): Speaking => {
    const tag = tags.bubble(line);
    tag.show(false);
    return { head: null, tag, until: 0 };
  };
  const ambient = AMBIENT.map(speakingOf);
  const spoken = new Map<BarLine, Speaking>(
    SPOKEN.map((line) => [line, speakingOf(line)])
  );
  const every = [...ambient, ...spoken.values()];
  const hushHead = (head: THREE.Vector3): void => {
    for (const speaking of every) {
      if (speaking.head === head) {
        speaking.until = 0;
      }
    }
  };
  return {
    ambient(turn, head, time) {
      const line = ambient[turn % ambient.length];
      if (line) {
        hushHead(head);
        line.head = head;
        line.until = time + AMBIENT_SECONDS;
      }
    },
    say(line, head, time) {
      const speaking = spoken.get(line);
      if (speaking) {
        hushHead(head);
        speaking.head = head;
        speaking.until = time + LINE_SECONDS;
      }
    },
    update(time, camera, size) {
      for (const speaking of every) {
        const live = speaking.head !== null && speaking.until > time;
        speaking.tag.show(live);
        if (live && speaking.head) {
          speaking.tag.set(speaking.head, camera, size);
        }
      }
    },
  };
};
