import { CorkBoard, CorkNote } from "@racer/ui/components/cork-note";
import { Heading } from "@racer/ui/components/heading";
import { Screen, ScreenBody, ScreenStrip } from "@racer/ui/components/screen";
import { useState } from "react";

import { introCards } from "../../career/copy.ts";
import { ActionMenu, SmallPrint, useEscape } from "./shared.tsx";

const tilts = [-2, 1.5, -1] as const;
const pins = ["red", "yellow", "blue"] as const;

export const IntroScreen = ({ onDone }: { readonly onDone: () => void }) => {
  const [shown, setShown] = useState(1);
  const last = shown >= introCards.length;
  useEscape(onDone);
  return (
    <Screen enter="fade">
      <ScreenStrip>
        <Heading as="h1">The Lowside</Heading>
        <SmallPrint>Vic Lomax runs the races out of the back room</SmallPrint>
      </ScreenStrip>
      <ScreenBody>
        <CorkBoard className="flex size-full flex-wrap content-center items-center justify-center gap-10">
          {introCards.slice(0, shown).map((card, index) => (
            <CorkNote
              className="notice-in"
              hand="typed"
              key={card}
              pin={pins[index] ?? "red"}
              signature={index === shown - 1 && last ? "V." : undefined}
              tilt={tilts[index] ?? 0}
            >
              {card}
            </CorkNote>
          ))}
        </CorkBoard>
      </ScreenBody>
      <ScreenStrip edge="bottom">
        <SmallPrint>
          {shown} / {introCards.length}
        </SmallPrint>
        <ActionMenu
          actions={[
            {
              id: "next",
              label: last ? "To the Lowside" : "Next",
              run: () => {
                if (last) {
                  onDone();
                } else {
                  setShown(shown + 1);
                }
              },
            },
          ]}
          label="Introduction"
          primary="next"
        />
      </ScreenStrip>
    </Screen>
  );
};
