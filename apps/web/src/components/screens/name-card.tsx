import { cleanGuestName } from "@racer/rooms/guest-name";
import {
  Card,
  PanelRule,
  PanelTitle,
  TextField,
} from "@racer/ui/components/kit-panel";
import {
  SkewButton,
  TextButton,
  TextLinks,
} from "@racer/ui/components/skew-button";
import { useState } from "react";

import { storeGuestName } from "../guest-name.ts";
import { useEscape } from "./shared.tsx";

const NAME_LENGTH = 12;

export const NameCard = ({
  start,
  onNamed,
  onCancel,
}: {
  readonly start: string | null;
  readonly onNamed?: () => void;
  readonly onCancel: () => void;
}) => {
  const [typed, setTyped] = useState(start ?? "");
  useEscape(onCancel);
  return (
    <div className="bg-night/65 fixed inset-0 z-30 flex items-center justify-center">
      <Card aria-label="Your name" role="dialog">
        <form
          className="flex flex-col gap-3.5"
          onSubmit={(event) => {
            event.preventDefault();
            storeGuestName(cleanGuestName(typed));
            onNamed?.();
          }}
        >
          <PanelTitle>
            <label htmlFor="guest-name">What do they call you?</label>
          </PanelTitle>
          <PanelRule />
          <TextField
            autoComplete="nickname"
            autoFocus
            id="guest-name"
            maxLength={NAME_LENGTH}
            onChange={(event) => {
              setTyped(event.target.value);
            }}
            required
            value={typed}
          />
          <SkewButton title="Walk in" tone="primary" type="submit" />
          <TextLinks>
            <TextButton onClick={onCancel}>Not now</TextButton>
          </TextLinks>
        </form>
      </Card>
    </div>
  );
};
