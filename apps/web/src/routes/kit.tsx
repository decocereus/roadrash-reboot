import { HintStrip, Key } from "@racer/ui/components/hint-strip";
import {
  Card,
  Panel,
  PanelLine,
  PanelRule,
  PanelTitle,
  TextField,
} from "@racer/ui/components/kit-panel";
import {
  ChipButton,
  MemberRow,
  OptionChips,
  RowList,
  SettingRow,
} from "@racer/ui/components/kit-rows";
import { Money } from "@racer/ui/components/money";
import { Pager } from "@racer/ui/components/pager";
import {
  SkewButton,
  TextButton,
  TextLinks,
} from "@racer/ui/components/skew-button";
import { StatBar } from "@racer/ui/components/stat-bar";
import { TabStrip } from "@racer/ui/components/tab-strip";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";

const kitTabs = ["race", "garage", "settings"] as const;

type KitTab = (typeof kitTabs)[number];

const tabLabels = {
  garage: "Garage",
  race: "Race",
  settings: "Settings",
} as const satisfies Record<KitTab, string>;

const swatches = [
  "bg-neon-yellow",
  "bg-neon-cyan",
  "bg-neon-magenta",
  "bg-neon-red",
  "bg-night",
  "bg-night-raised",
  "bg-ink",
  "bg-paper",
] as const;

const onOff = [
  { label: "On", value: "on" },
  { label: "Off", value: "off" },
] as const;

const KitPage = () => {
  const [tab, setTab] = useState<KitTab>("race");
  const [sound, setSound] = useState<"on" | "off">("on");
  const [page, setPage] = useState(1);
  return (
    <div className="bg-ink text-paper font-display min-h-screen pb-16">
      <TabStrip
        label="Kit tabs"
        onChange={setTab}
        panelId="kit-panels"
        tabs={kitTabs.map((value) => ({ label: tabLabels[value], value }))}
        value={tab}
      >
        Riding as Alpha
      </TabStrip>
      <div
        className="flex flex-wrap items-start gap-6 p-6"
        id="kit-panels"
        role="tabpanel"
      >
        <div className="flex flex-wrap gap-2">
          {swatches.map((swatch) => (
            <span
              className={`${swatch} border-paper/30 size-12 border`}
              key={swatch}
            />
          ))}
        </div>
        <Panel aria-label="Race">
          <PanelTitle>Race</PanelTitle>
          <PanelRule />
          <SkewButton
            detail="Public lobby. Eight riders, one road."
            title="Find a race"
            tone="primary"
          />
          <SkewButton detail="Your own lobby." title="Race friends" />
          <SkewButton detail="Picked." title="Ride solo" tone="picked" />
          <div className="flex gap-3.5">
            <SkewButton size="slim" title="Sound on" />
            <SkewButton disabled size="slim" title="Settings" />
          </div>
          <PanelLine>
            Purse <Money amount={1200} />
          </PanelLine>
          <PanelLine tone="quiet">A quiet line.</PanelLine>
          <PanelLine tone="warn">A warning line.</PanelLine>
          <TextLinks>
            <TextButton>Back</TextButton>
            <TextButton>Privacy</TextButton>
          </TextLinks>
        </Panel>
        <Panel aria-label="Settings">
          <PanelTitle face="stencil">Settings</PanelTitle>
          <PanelRule />
          <RowList>
            <SettingRow label="Sound">
              <OptionChips
                label="Sound"
                onChange={setSound}
                options={onOff}
                value={sound}
              />
            </SettingRow>
            <SettingRow label="Name">
              <ChipButton on>Alpha</ChipButton>
              <ChipButton>Change</ChipButton>
            </SettingRow>
            <MemberRow chip="A" me name="Alpha" ready state="Ready" />
            <MemberRow chip="B" name="Bravo" state="Waiting" />
          </RowList>
          <StatBar label="Speed" share={0.75} tone="yellow" />
          <StatBar label="Grip" share={0.5} tone="cyan" />
          <StatBar label="Weight" share={0.25} tone="magenta" />
          <Pager
            label="Bikes"
            onBack={() => {
              setPage((current) => Math.max(1, current - 1));
            }}
            onNext={() => {
              setPage((current) => current + 1);
            }}
          >
            Bike {page}
          </Pager>
        </Panel>
        <Card aria-label="Card">
          <PanelTitle>What do they call you?</PanelTitle>
          <PanelRule />
          <TextField aria-label="Name" defaultValue="Alpha" />
          <SkewButton title="Walk in" tone="primary" />
        </Card>
      </div>
      <HintStrip
        className="fixed inset-x-0 bottom-0"
        end={
          <>
            Camera <Key>C</Key> Angled
          </>
        }
        start={
          <>
            <Key>WASD</Key> or click to move
          </>
        }
      />
    </div>
  );
};

export const Route = createFileRoute("/kit")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      notFound({ throw: true });
    }
  },
  component: KitPage,
  head: () => ({
    meta: [
      { title: "Rushline UI kit" },
      { content: "noindex", name: "robots" },
    ],
  }),
  ssr: false,
});
