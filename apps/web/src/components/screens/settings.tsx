import { frameRates, testDevices } from "@racer/telemetry/limits";
import type { FrameRate, TestDevice } from "@racer/telemetry/limits";
import { Heading } from "@racer/ui/components/heading";
import { Panel } from "@racer/ui/components/panel";
import { Screen } from "@racer/ui/components/screen";
import { useSyncExternalStore } from "react";

import { diagnostics } from "../../diagnostics/hub.ts";
import type { DiagnosticsView } from "../../diagnostics/hub.ts";
import type { ReportStatus } from "../../diagnostics/uploader.ts";
import { ActionMenu, useEscape } from "./shared.tsx";
import type { MenuAction } from "./shared.tsx";

const deviceNames = {
  air: "MacBook Air",
  pro: "MacBook Pro",
  unspecified: "Not set",
} as const satisfies Record<TestDevice, string>;

const rateNames = {
  30: "30",
  60: "60",
  auto: "Auto",
} as const satisfies Record<FrameRate, string>;

const onOff = (on: boolean): string => (on ? "On" : "Off");

const nextRate = (rate: FrameRate): FrameRate =>
  frameRates[(frameRates.indexOf(rate) + 1) % frameRates.length] ?? "auto";

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

export function SettingsScreen({ onBack }: { readonly onBack: () => void }) {
  const hub = diagnostics();
  const { settings, report, queued, session } = useDiagnosticsView();
  useEscape(onBack);
  const reported = reportLine(report);
  const actions: MenuAction[] = [
    {
      detail: "Auto lowers detail, then holds a steady 30, when frames slip",
      id: "frame-rate",
      label: "Frame rate",
      run: () =>
        hub.settings.change({ frameRate: nextRate(settings.frameRate) }),
      trailing: rateNames[settings.frameRate],
    },
    {
      detail: "Frame rate, frame times, and quality rung in the corner",
      id: "overlay",
      label: "Frame meter",
      run: () => hub.settings.change({ overlay: !settings.overlay }),
      trailing: onOff(settings.overlay),
    },
    {
      detail: "Keeps frame times, quality changes, and errors from this tab",
      id: "recording",
      label: "Recording",
      run: () => hub.settings.change({ recording: !settings.recording }),
      trailing: onOff(settings.recording),
    },
    {
      detail: "Sends the recording to the play server every 30 seconds",
      id: "upload",
      label: "Automatic upload",
      run: () =>
        hub.settings.change({ automaticUpload: !settings.automaticUpload }),
      trailing: onOff(settings.automaticUpload),
    },
    {
      id: "device",
      label: "Test device",
      run: () => hub.settings.change({ device: nextDevice(settings.device) }),
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
    { id: "back", label: "Back", run: onBack },
  ];
  return (
    <Screen className="bg-ink/60">
      <Panel
        className="p-gutter flex h-full w-[min(30rem,40vw)] flex-col gap-6 border-y-0 border-l-0"
        padding="none"
      >
        <Heading as="h1">Settings</Heading>
        <ActionMenu
          actions={actions}
          className="w-full"
          label="Settings"
          orientation="vertical"
          primary="frame-rate"
          size="md"
        />
        <div className="text-muted mt-auto flex flex-col gap-2 text-sm font-semibold">
          <p>B while riding marks the moment in the recording.</p>
          <p>Session {session}</p>
        </div>
      </Panel>
    </Screen>
  );
}
