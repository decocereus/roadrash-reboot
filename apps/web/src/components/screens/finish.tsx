import { QUALIFYING_PLACE } from "@racer/career/tables";
import { Screen } from "@racer/ui/components/screen";
import { Stencil } from "@racer/ui/components/stencil";
import { useEffect, useState } from "react";

import { shortNames } from "../../career/copy.ts";
import type { RaceReport } from "../../career/flow.ts";
import { ordinal } from "../../career/format.ts";
import { ActionMenu } from "./shared.tsx";

const CONTINUE_AFTER = 1500;
const MOVE_ON_AFTER = 5000;

const wheelLine = (report: RaceReport): string => {
  const beaten = report.summary.incidents.find(
    (incident) => incident.lostToPlayerByAWheel
  );
  if (beaten) {
    return `By a wheel over ${shortNames[beaten.rival]}`;
  }
  const winner = report.summary.incidents.find(
    (incident) => incident.beatPlayerByAWheel
  );
  return winner ? `${shortNames[winner.rival]} by a wheel` : "";
};

export const FinishBanner = ({
  report,
  onContinue,
}: {
  readonly report: RaceReport;
  readonly onContinue: () => void;
}) => {
  const [offered, setOffered] = useState(false);
  useEffect(() => {
    const offer = window.setTimeout(() => {
      setOffered(true);
    }, CONTINUE_AFTER);
    const leave = window.setTimeout(onContinue, MOVE_ON_AFTER);
    return () => {
      window.clearTimeout(offer);
      window.clearTimeout(leave);
    };
  }, [onContinue]);
  const qualified = report.place <= QUALIFYING_PLACE;
  const wheel = wheelLine(report);
  return (
    <Screen className="bg-transparent">
      <div className="absolute inset-x-0 top-[12%] flex flex-col items-center gap-2 text-center">
        <Stencil className="hud-ink">
          {report.place === 1 ? "Winner" : "Finished"}
        </Stencil>
        <p className="font-display tracking-display text-hud hud-ink numeric font-extrabold uppercase">
          {ordinal(report.place)}
          {report.mode === "career" && (
            <span className={qualified ? "text-neon-yellow" : "text-text"}>
              {qualified ? " · Qualified" : " · Not this time"}
            </span>
          )}
        </p>
        {wheel !== "" && (
          <p className="font-display tracking-display text-name hud-ink font-bold uppercase">
            {wheel}
          </p>
        )}
      </div>
      {offered && (
        <div className="absolute right-[4%] bottom-[5%]">
          <ActionMenu
            actions={[{ id: "continue", label: "Continue", run: onContinue }]}
            className="hud-ink"
            label="Finish"
            primary="continue"
            size="md"
          />
        </div>
      )}
    </Screen>
  );
};
