import { frameRates, testDevices } from "@racer/telemetry/limits";
import type { TestDevice } from "@racer/telemetry/limits";
import {
  Panel,
  PanelLine,
  PanelRule,
  PanelTitle,
} from "@racer/ui/components/kit-panel";
import {
  ChipButton,
  OptionChips,
  RowList,
  SettingRow,
} from "@racer/ui/components/kit-rows";
import { TextButton, TextLinks } from "@racer/ui/components/skew-button";
import { useState, useSyncExternalStore } from "react";
import type { ComponentProps } from "react";

import {
  barCameraLabels,
  barCameras,
  saveBarCamera,
  savedBarCamera,
} from "../../bar-view.ts";
import type { BarCamera } from "../../bar-view.ts";
import { diagnostics } from "../../diagnostics/hub.ts";
import type { Diagnostics, DiagnosticsView } from "../../diagnostics/hub.ts";
import type { ReportStatus } from "../../diagnostics/uploader.ts";
import { storedGuestName, watchGuestName } from "../guest-name.ts";
import { Confirm } from "./confirm.tsx";
import { NameCard } from "./name-card.tsx";
import { useEscape } from "./shared.tsx";

const deviceNames = {
  air: "MacBook Air",
  pro: "MacBook Pro",
  unspecified: "Not set",
} as const satisfies Record<TestDevice, string>;

const onOff = [
  { label: "On", value: "on" },
  { label: "Off", value: "off" },
] as const;

const isOn = (value: "on" | "off"): boolean => value === "on";

const switchOf = (on: boolean): "on" | "off" => (on ? "on" : "off");

const rateOptions = frameRates.map((value) => ({ label: value, value }));

const cameraOptions = barCameras.map((value) => ({
  label: barCameraLabels[value],
  value,
}));

const deviceOptions = testDevices.map((value) => ({
  label: deviceNames[value],
  value,
}));

const reportLine = (report: ReportStatus): string => {
  switch (report.state) {
    case "idle": {
      return "";
    }
    case "sending": {
      return `Sending ${report.reportId}`;
    }
    case "saved": {
      return `Sent ${report.reportId}`;
    }
    case "queued": {
      return `Could not send ${report.reportId} yet. Trying again.`;
    }
    case "failed": {
      return `Could not send ${report.reportId}.`;
    }
    default: {
      return report satisfies never;
    }
  }
};

const useDiagnosticsView = (): DiagnosticsView => {
  const hub = diagnostics();
  return useSyncExternalStore(hub.subscribe, hub.view, hub.view);
};

const useGuestName = (): string | null =>
  useSyncExternalStore(watchGuestName, storedGuestName, () => null);

const TesterRows = ({
  hub,
  view,
}: {
  readonly hub: Diagnostics;
  readonly view: DiagnosticsView;
}) => {
  const { playerId, queued, report, session, settings } = view;
  const sent = reportLine(report);
  return (
    <>
      <SettingRow label="Frame meter">
        <OptionChips
          label="Frame meter"
          onChange={(value) => {
            hub.settings.change({ overlay: isOn(value) });
          }}
          options={onOff}
          value={switchOf(settings.overlay)}
        />
      </SettingRow>
      <SettingRow label="Recording">
        <OptionChips
          label="Recording"
          onChange={(value) => {
            hub.settings.change({ recording: isOn(value) });
          }}
          options={onOff}
          value={switchOf(settings.recording)}
        />
      </SettingRow>
      <SettingRow label="Automatic upload">
        <OptionChips
          label="Automatic upload"
          onChange={(value) => {
            hub.settings.change({ automaticUpload: isOn(value) });
          }}
          options={onOff}
          value={switchOf(settings.automaticUpload)}
        />
      </SettingRow>
      <SettingRow label="Test device">
        <OptionChips
          label="Test device"
          onChange={(device) => {
            hub.settings.change({ device });
          }}
          options={deviceOptions}
          value={settings.device}
        />
      </SettingRow>
      <SettingRow label="Report">
        <ChipButton onClick={hub.sendReport}>Send</ChipButton>
      </SettingRow>
      <PanelLine tone="quiet">
        {sent === ""
          ? `Sends what is recorded now${queued > 0 ? ` and ${queued} waiting` : ""}.`
          : sent}{" "}
        Your ID {playerId}. Recording {session}. B while riding marks the
        moment.
      </PanelLine>
    </>
  );
};

export const SettingsPanel = ({
  camera,
  muted,
  onCamera,
  onMute,
  onNewCareer,
  onBack,
  ...props
}: Omit<ComponentProps<"section">, "children"> & {
  readonly camera: BarCamera;
  readonly muted: boolean;
  readonly onCamera: (camera: BarCamera) => void;
  readonly onMute: () => void;
  readonly onNewCareer: (() => void) | null;
  readonly onBack: (() => void) | null;
}) => {
  const hub = diagnostics();
  const view = useDiagnosticsView();
  const name = useGuestName();
  const [naming, setNaming] = useState(false);
  const [erasing, setErasing] = useState(false);
  const tester = new URLSearchParams(globalThis.location.search).has("tester");
  const { settings } = view;
  return (
    <>
      <Panel aria-label="Settings" {...props}>
        <PanelTitle>Settings</PanelTitle>
        <PanelRule />
        <RowList>
          <SettingRow label="Name">
            {name !== null && <ChipButton on>{name}</ChipButton>}
            <ChipButton
              onClick={() => {
                setNaming(true);
              }}
            >
              {name === null ? "Pick one" : "Change"}
            </ChipButton>
          </SettingRow>
          <SettingRow label="Sound">
            <OptionChips
              label="Sound"
              onChange={(value) => {
                if (isOn(value) === muted) {
                  onMute();
                }
              }}
              options={onOff}
              value={switchOf(!muted)}
            />
          </SettingRow>
          <SettingRow label="Camera in the bar">
            <OptionChips
              label="Camera in the bar"
              onChange={onCamera}
              options={cameraOptions}
              value={camera}
            />
          </SettingRow>
          <SettingRow label="Frame rate">
            <OptionChips
              label="Frame rate"
              onChange={(frameRate) => {
                hub.settings.change({ frameRate });
              }}
              options={rateOptions}
              value={settings.frameRate}
            />
          </SettingRow>
          <SettingRow label="Race data">
            <OptionChips
              label="Race data"
              onChange={(value) => {
                hub.settings.change({ raceData: isOn(value) });
              }}
              options={onOff}
              value={switchOf(settings.raceData)}
            />
          </SettingRow>
          {tester && <TesterRows hub={hub} view={view} />}
        </RowList>
        <TextLinks>
          {onNewCareer && (
            <TextButton
              onClick={() => {
                setErasing(true);
              }}
            >
              New career
            </TextButton>
          )}
          <a
            className="text-paper border-paper/40 hover:text-neon-yellow border-b-2 pb-0.5 text-lg font-bold uppercase"
            href="/privacy"
            rel="noopener noreferrer"
            target="_blank"
          >
            Privacy
          </a>
          <a
            className="text-paper border-paper/40 hover:text-neon-yellow border-b-2 pb-0.5 text-lg font-bold uppercase"
            href="/credits"
            rel="noopener noreferrer"
            target="_blank"
          >
            Credits
          </a>
          {onBack && <TextButton onClick={onBack}>Back</TextButton>}
        </TextLinks>
      </Panel>
      {naming && (
        <NameCard
          onCancel={() => {
            setNaming(false);
          }}
          onNamed={() => {
            setNaming(false);
          }}
          start={name}
        />
      )}
      {erasing && onNewCareer && (
        <Confirm
          defaultValue="keep"
          label="New career"
          onDismiss={() => {
            setErasing(false);
          }}
          onSelect={(value) => {
            setErasing(false);
            if (value === "erase") {
              onNewCareer();
            }
          }}
          options={[
            { label: "Keep it", value: "keep" },
            { label: "Erase and start", value: "erase" },
          ]}
        >
          Start over? Your career will be erased.
        </Confirm>
      )}
    </>
  );
};

export const SettingsOverlay = ({
  muted,
  onMute,
  onBack,
}: {
  readonly muted: boolean;
  readonly onMute: () => void;
  readonly onBack: () => void;
}) => {
  const [camera, setCamera] = useState(savedBarCamera);
  useEscape(onBack);
  return (
    <div className="bg-ink/45 fixed inset-0 z-40 flex items-start justify-end pt-16 pr-4">
      <SettingsPanel
        camera={camera}
        className="max-h-[calc(100vh-5rem)]"
        muted={muted}
        onBack={onBack}
        onCamera={(next) => {
          setCamera(next);
          saveBarCamera(next);
        }}
        onMute={onMute}
        onNewCareer={null}
      />
    </div>
  );
};
