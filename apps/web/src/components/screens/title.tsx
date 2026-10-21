import type { SaveError } from "@racer/career/save";
import type { CareerState } from "@racer/career/state";
import { Confirm } from "@racer/ui/components/confirm";
import { formatMoney } from "@racer/ui/components/money";
import { Panel } from "@racer/ui/components/panel";
import { Screen, ScreenBody } from "@racer/ui/components/screen";
import { Stencil } from "@racer/ui/components/stencil";
import { useState } from "react";

import { CONTROLS, saveErrors, TAGLINE, WORDMARK } from "../../career/copy.ts";
import { bikeName } from "../../career/format.ts";
import type { SaveState } from "../../career/save.ts";
import { SettingsScreen } from "./settings.tsx";
import { ActionMenu, SmallPrint } from "./shared.tsx";
import type { MenuAction } from "./shared.tsx";

const SOON = "Soon";

const careerActions = (
  career: CareerState,
  onContinue: () => void,
  askNew: () => void
): MenuAction[] => {
  if (career.gameOver) {
    return [
      {
        detail: "See the record",
        id: "continue",
        label: "Career over",
        run: onContinue,
      },
      { id: "new", label: "New career", run: askNew },
    ];
  }
  if (career.story.ending !== null) {
    return [
      {
        detail: "See the ending",
        id: "continue",
        label: "Season over",
        run: onContinue,
      },
      { id: "new", label: "New career", run: askNew },
    ];
  }
  return [
    {
      detail: `Level ${career.level} · ${formatMoney(career.cash)} · ${bikeName(career.bikeId)}`,
      id: "continue",
      label: "Continue career",
      run: onContinue,
    },
    { id: "new", label: "New career", run: askNew },
  ];
};

function CorruptSave({ error }: { readonly error: SaveError }) {
  return (
    <Panel className="mb-4 max-w-md" edge="var(--red)" role="alert">
      <p className="font-semibold">
        {saveErrors[error.kind]}
        {error.field === "" ? "." : ` (${error.field}).`}
      </p>
      <p className="text-muted mt-1 text-sm">
        Save error: {error.kind}. Start over keeps the old save in the browser
        under a backup key and begins a new career.
      </p>
    </Panel>
  );
}

export function TitleScreen({
  save,
  failure,
  onContinue,
  onNewCareer,
  onQuickRace,
  onStartOver,
}: {
  readonly save: SaveState;
  readonly failure: string;
  readonly onContinue: () => void;
  readonly onNewCareer: () => void;
  readonly onQuickRace: () => void;
  readonly onStartOver: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const quick: MenuAction[] = [
    { id: "quick", label: "Single race", run: onQuickRace },
    {
      disabled: true,
      id: "multiplayer",
      label: "Multiplayer",
      trailing: SOON,
    },
    {
      id: "settings",
      label: "Settings",
      run: () => {
        setAdjusting(true);
      },
    },
  ];
  const career: MenuAction[] =
    save.status === "ready"
      ? careerActions(save.career, onContinue, () => {
          setAsking(true);
        })
      : save.status === "corrupt"
        ? [{ id: "continue", label: "Start over", run: onStartOver }]
        : [{ id: "continue", label: "Career", run: onNewCareer }];
  if (adjusting) {
    return (
      <SettingsScreen
        onBack={() => {
          setAdjusting(false);
        }}
      />
    );
  }
  return (
    <Screen className="bg-transparent" enter="fade" scrim="soft">
      <ScreenBody
        className="flex flex-col justify-between"
        inert={asking ? true : undefined}
      >
        <div>
          <Stencil tone="text">{WORDMARK}</Stencil>
          <p className="text-quote mt-2 font-semibold">{TAGLINE}</p>
        </div>
        <div className="flex items-end justify-between gap-8">
          <div>
            {save.status === "corrupt" && <CorruptSave error={save.error} />}
            {failure !== "" && (
              <p className="text-red mb-4 font-semibold" role="alert">
                Could not start the game: {failure}
              </p>
            )}
            {save.status !== "loading" && (
              <ActionMenu
                actions={[...career, ...quick]}
                label="Title menu"
                orientation="vertical"
                primary="continue"
                size="md"
              />
            )}
          </div>
          <SmallPrint>{CONTROLS}</SmallPrint>
        </div>
      </ScreenBody>
      {asking && save.status === "ready" && (
        <Confirm
          defaultValue="keep"
          label="Start over"
          onDismiss={() => {
            setAsking(false);
          }}
          onSelect={(value) => {
            setAsking(false);
            if (value === "erase") {
              onNewCareer();
            }
          }}
          options={[
            { label: "Keep it", value: "keep" },
            { label: "Erase and start", value: "erase" },
          ]}
        >
          Start over? Your Level {save.career.level} career will be erased.
        </Confirm>
      )}
    </Screen>
  );
}
