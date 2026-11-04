import { cleanGuestName } from "@racer/rooms/messages";
import { enterQueue } from "@racer/rooms/queue-client";
import { useEffect, useReducer, useState } from "react";

import { storedGuestName, storeGuestName } from "./guest-name.ts";
import { moveToRoom } from "./room-url.ts";
import { QueueScreen } from "./screens/quick-race.tsx";
import { GuestNameScreen } from "./screens/room-lobby.tsx";

const REOPEN_MS = 2000;

const FindingRiders = ({ onBack }: { readonly onBack: () => void }) => {
  const [riders, setRiders] = useState(1);
  const [refused, setRefused] = useState(false);
  const [opening, reopen] = useReducer((count: number) => count + 1, 0);
  useEffect(() => {
    let reopening: ReturnType<typeof setTimeout> | null = null;
    const leave = enterQueue(
      import.meta.env.VITE_ROOMS_URL,
      __RUSHLINE_BUILD__.rooms,
      {
        onLost: () => {
          reopening = setTimeout(reopen, REOPEN_MS);
        },
        onMessage: (message) => {
          switch (message.kind) {
            case "waiting": {
              setRiders(message.riders);
              break;
            }
            case "placed": {
              moveToRoom(message.roomId, "queue");
              break;
            }
            case "refused": {
              setRefused(true);
              break;
            }
            default: {
              message satisfies never;
            }
          }
        },
      }
    );
    return () => {
      if (reopening) {
        clearTimeout(reopening);
      }
      leave();
    };
  }, [opening]);
  return <QueueScreen onBack={onBack} refused={refused} riders={riders} />;
};

export const QuickRace = ({ onBack }: { readonly onBack: () => void }) => {
  const [name, setName] = useState(storedGuestName);
  if (name === null) {
    return (
      <GuestNameScreen
        onBack={onBack}
        onName={(typed) => {
          const clean = cleanGuestName(typed);
          storeGuestName(clean);
          setName(clean);
        }}
      />
    );
  }
  return <FindingRiders onBack={onBack} />;
};
