import { frameRates, testDevices } from "@racer/telemetry/limits";
import type { FrameRate, TestDevice } from "@racer/telemetry/limits";
import { Screen } from "@racer/ui/components/screen";
import { useState, useSyncExternalStore } from "react";

import { diagnostics } from "../../diagnostics/hub.ts";
import type { Diagnostics, DiagnosticsView } from "../../diagnostics/hub.ts";
import type { ReportStatus } from "../../diagnostics/uploader.ts";
import { BarStrip } from "./bar-chrome.tsx";
import { Stage, stagePx } from "./clubhouse-stage.tsx";
import { PinnedList } from "./pinned-list.tsx";
import { useEscape } from "./shared.tsx";
import type { MenuAction } from "./shared.tsx";

const deviceNames = {
  air: "MacBook Air",
  pro: "MacBook Pro",
  unspecified: "Not set",
} as const satisfies Record<TestDevice, string>;

const onOff = (on: boolean): string => (on ? "On" : "Off");

const nextRate = (rate: FrameRate): FrameRate =>
  frameRates[(frameRates.indexOf(rate) + 1) % frameRates.length] ?? "60";

const nextDevice = (device: TestDevice): TestDevice =>
  testDevices[(testDevices.indexOf(device) + 1) % testDevices.length] ??
  "unspecified";

const reportLine = (report: ReportStatus): string => {
  if (report.state === "idle") {
    return "";
  }
  if (report.state === "sending") {
    return `Sending ${report.reportId}`;
  }
  if (report.state === "saved") {
    return `Saved ${report.reportId}`;
  }
  if (report.state === "queued") {
    return `Queued ${report.reportId}: ${report.reason}, retrying`;
  }
  return `Failed ${report.reportId}: ${report.reason}`;
};

const useDiagnosticsView = (): DiagnosticsView => {
  const hub = diagnostics();
  return useSyncExternalStore(hub.subscribe, hub.view, hub.view);
};

const testerActions = (
  hub: Diagnostics,
  { queued, report, settings }: DiagnosticsView
): readonly MenuAction[] => {
  const reported = reportLine(report);
  return [
    {
      detail: "Keeps frame times, quality changes, and errors from this tab",
      id: "recording",
      label: "Recording",
      run: () => {
        hub.settings.change({ recording: !settings.recording });
      },
      trailing: onOff(settings.recording),
    },
    {
      detail: "Sends the recording to the play server every 30 seconds",
      id: "upload",
      label: "Automatic upload",
      run: () => {
        hub.settings.change({ automaticUpload: !settings.automaticUpload });
      },
      trailing: onOff(settings.automaticUpload),
    },
    {
      id: "device",
      label: "Test device",
      run: () => {
        hub.settings.change({ device: nextDevice(settings.device) });
      },
      trailing: deviceNames[settings.device],
    },
    {
      detail:
        reported === ""
          ? `Uploads what is recorded now${queued > 0 ? ` and ${queued} waiting` : ""}`
          : reported,
      id: "report",
      label: "Send report",
      run: hub.sendReport,
    },
  ];
};

export const SettingsScreen = ({ onBack }: { readonly onBack: () => void }) => {
  const hub = diagnostics();
  const view = useDiagnosticsView();
  const { playerId, session, settings } = view;
  const [focused, setFocused] = useState("frame-rate");
  useEscape(onBack);
  const tester = new URLSearchParams(globalThis.location.search).has("tester");
  const actions: MenuAction[] = [
    {
      detail: "The game holds this rate; the picture never changes in a race",
      id: "frame-rate",
      label: "Frame rate",
      run: () => {
        hub.settings.change({ frameRate: nextRate(settings.frameRate) });
      },
      trailing: settings.frameRate,
    },
    {
      detail: "Frame rate, frame times, and quality preset in the corner",
      id: "overlay",
      label: "Frame meter",
      run: () => {
        hub.settings.change({ overlay: !settings.overlay });
      },
      trailing: onOff(settings.overlay),
    },
    {
      detail: `Sends race and game events under your ID ${playerId}`,
      id: "race-data",
      label: "Race data",
      run: () => {
        hub.settings.change({ raceData: !settings.raceData });
      },
      trailing: onOff(settings.raceData),
    },
    ...(tester ? testerActions(hub, view) : []),
    { id: "back", label: "Back", run: onBack },
  ];
  const hint = actions.find((action) => action.id === focused)?.detail;
  return (
    <Screen className="bg-ink/60 flex">
      <Stage>
        <PinnedList
          actions={actions}
          autoFocus
          compact
          label="Settings"
          left={560}
          onFocusItem={setFocused}
          primary="frame-rate"
          title="Settings"
        />
        <BarStrip opaque>
          <p
            className="text-paper/75 tracking-wide"
            style={{ fontSize: stagePx(20) }}
          >
            {hint ?? ""}
          </p>
          {tester && (
            <p
              className="text-paper/50 tracking-wide"
              style={{ fontSize: stagePx(18) }}
            >
              B while riding marks the moment · Session {session}
            </p>
          )}
          <div className="flex" style={{ gap: stagePx(24) }}>
            <a
              className="text-paper/75 underline underline-offset-4"
              href="/privacy"
              rel="noopener noreferrer"
              style={{ fontSize: stagePx(20) }}
              target="_blank"
            >
              Privacy (new tab)
            </a>
            <a
              className="text-paper/75 underline underline-offset-4"
              href="/credits"
              rel="noopener noreferrer"
              style={{ fontSize: stagePx(20) }}
              target="_blank"
            >
              Data credits (new tab)
            </a>
          </div>
        </BarStrip>
      </Stage>
    </Screen>
  );
};
