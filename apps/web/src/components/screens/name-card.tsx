import { cleanGuestName } from "@racer/rooms/guest-name";
import {
  Card,
  PanelLine,
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
import type { ReactNode } from "react";

import { storeGuestName } from "../guest-name.ts";
import { useEscape } from "./shared.tsx";

const NAME_LENGTH = 12;

const LINK =
  "text-paper border-paper/40 hover:text-neon-yellow border-b-2 pb-0.5 text-lg font-bold uppercase";

const NameForm = ({
  label,
  start,
  onNamed,
  children,
  links,
}: {
  readonly label: string;
  readonly start: string | null;
  readonly onNamed: (name: string) => void;
  readonly children?: ReactNode;
  readonly links: ReactNode;
}) => {
  const [typed, setTyped] = useState(start ?? "");
  return (
    <div className="bg-night/65 fixed inset-0 z-30 flex items-center justify-center">
      <Card aria-label={label} role="dialog">
        <form
          className="flex flex-col gap-3.5"
          onSubmit={(event) => {
            event.preventDefault();
            onNamed(cleanGuestName(typed));
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
          {children}
          <SkewButton title="Walk in" tone="primary" type="submit" />
          <TextLinks>{links}</TextLinks>
        </form>
      </Card>
    </div>
  );
};

export const NameCard = ({
  start,
  onNamed,
  onCancel,
}: {
  readonly start: string | null;
  readonly onNamed?: () => void;
  readonly onCancel: () => void;
}) => {
  useEscape(onCancel);
  return (
    <NameForm
      label="Your name"
      links={<TextButton onClick={onCancel}>Not now</TextButton>}
      onNamed={(name) => {
        storeGuestName(name);
        onNamed?.();
      }}
      start={start}
    />
  );
};

export const WelcomeCard = ({
  start,
  onWalkIn,
}: {
  readonly start: string | null;
  readonly onWalkIn: (name: string) => void;
}) => (
  <NameForm
    label="First visit"
    links={
      <a
        className={LINK}
        href="/privacy"
        rel="noopener noreferrer"
        target="_blank"
      >
        Privacy
      </a>
    }
    onNamed={onWalkIn}
    start={start}
  >
    <PanelLine>
      We record your races and how the game runs, under a random ID kept on this
      device. Never your name. You can switch it off in Settings.
    </PanelLine>
  </NameForm>
);
