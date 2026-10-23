import { Confirm } from "@racer/ui/components/confirm";
import { MenuItem, MenuList } from "@racer/ui/components/menu-list";
import { Screen, ScreenBody } from "@racer/ui/components/screen";
import { useState } from "react";

import { Section } from "./section.tsx";

export const Asking = () => {
  const [answer, setAnswer] = useState("not asked");
  const [open, setOpen] = useState(true);
  return (
    <Section title="Confirm, Screen enter">
      <div className="border-line relative h-80 border-2">
        <Screen enter="fade" fit="parent">
          <ScreenBody className="flex flex-col justify-end gap-4">
            <p className="text-muted">Answer: {answer}</p>
            <MenuList
              label="Confirm demo"
              onSelect={() => {
                setOpen(true);
              }}
              orientation="horizontal"
              size="sm"
            >
              <MenuItem value="ask">Quit race</MenuItem>
            </MenuList>
          </ScreenBody>
          {open && (
            <Confirm
              defaultValue="keep"
              label="Quit race"
              onDismiss={() => {
                setOpen(false);
                setAnswer("dismissed");
              }}
              onSelect={(value) => {
                setOpen(false);
                setAnswer(value);
              }}
              options={[
                { label: "Keep racing", value: "keep" },
                { label: "Quit and pay", value: "quit" },
              ]}
              warning="This bill takes the Halden Kite 500."
            >
              Quit this race? It counts as a wreck: no prize, and a $900 repair
              bill.
            </Confirm>
          )}
        </Screen>
      </div>
    </Section>
  );
};
