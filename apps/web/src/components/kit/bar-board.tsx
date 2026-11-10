import { HintStrip, Key } from "@racer/ui/components/hint-strip";
import {
  Panel,
  PanelLine,
  PanelRule,
  PanelTitle,
} from "@racer/ui/components/kit-panel";
import {
  ChipButton,
  MemberRow,
  OptionChips,
  RowList,
  SettingRow,
} from "@racer/ui/components/kit-rows";
import {
  SkewButton,
  TextButton,
  TextLinks,
} from "@racer/ui/components/skew-button";
import { TabStrip } from "@racer/ui/components/tab-strip";
import { useState } from "react";

import { RiderChip } from "../screens/shared.tsx";

const tabs = [
  { label: "Race", value: "race" },
  { label: "Garage", value: "garage" },
  { label: "Settings", value: "settings" },
] as const;

const frameRates = [
  { label: "Auto", value: "auto" },
  { label: "30", value: "30" },
  { label: "60", value: "60" },
] as const;

const PANEL_ID = "kit-bar-panel";

export const BarBoard = () => {
  const [tab, setTab] = useState<(typeof tabs)[number]["value"]>("race");
  const [rate, setRate] =
    useState<(typeof frameRates)[number]["value"]>("auto");
  const [muted, setMuted] = useState(false);
  const [ready, setReady] = useState(false);
  return (
    <section aria-label="Bar panels" className="mt-16">
      <h2 className="font-display text-paper text-name font-bold uppercase">
        Bar panels
      </h2>
      <p className="text-paper/60 mt-1 mb-4 max-w-3xl">
        The tab strip, a panel with its title, rule, lines, buttons, rows and
        option chips, and the footer hint strip, at the 1504 × 790 window the
        bar is checked at.
      </p>
      <div className="bg-ink relative h-[790px] w-[1504px] max-w-full overflow-hidden border border-white/10">
        <TabStrip
          className="absolute inset-x-0 top-0"
          label="Kit tabs"
          onChange={setTab}
          panelId={PANEL_ID}
          tabs={tabs}
          value={tab}
        >
          <RiderChip colour={2} />
          Riding as Vex
        </TabStrip>
        <div
          className="absolute top-16 right-4 bottom-16 flex flex-col items-end"
          id={PANEL_ID}
          role="tabpanel"
        >
          <Panel aria-label="Kit panel">
            <PanelTitle face="stencil">kit-room</PanelTitle>
            <PanelRule />
            <PanelLine>Slag Row. Starts when everyone is ready.</PanelLine>
            <RowList aria-label="Riders in the kit">
              <MemberRow
                chip={<RiderChip colour={2} />}
                me
                name="Vex (you)"
                ready={ready}
                state={ready ? "Ready" : "Not ready"}
              />
              <MemberRow
                chip={<RiderChip colour={5} />}
                name="Mags"
                ready
                state="Ready"
              />
            </RowList>
            <SkewButton
              detail="Enter"
              onClick={() => {
                setReady((now) => !now);
              }}
              title={ready ? "Not ready" : "Ready"}
              tone="primary"
            />
            <SkewButton detail="A plain choice." title="Ride solo" />
            <RowList aria-label="Kit settings">
              <SettingRow label="Sound">
                <ChipButton
                  on={!muted}
                  onClick={() => {
                    setMuted((now) => !now);
                  }}
                >
                  {muted ? "Off" : "On"}
                </ChipButton>
              </SettingRow>
              <SettingRow label="Frame rate">
                <OptionChips
                  label="Frame rate"
                  onChange={setRate}
                  options={frameRates}
                  value={rate}
                />
              </SettingRow>
            </RowList>
            <TextLinks>
              <TextButton>Copy the link</TextButton>
              <TextButton>Leave</TextButton>
            </TextLinks>
          </Panel>
        </div>
        <HintStrip
          className="absolute inset-x-0 bottom-0"
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
    </section>
  );
};
