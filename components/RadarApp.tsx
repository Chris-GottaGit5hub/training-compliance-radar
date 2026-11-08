"use client";

import { DashboardStep } from "./DashboardStep";
import { DataStep } from "./DataStep";
import { Footer } from "./Footer";
import { Header } from "./Header";
import { RulesStep } from "./RulesStep";
import { Stepper, type StepInfo } from "./Stepper";
import { UnitPanel } from "./UnitPanel";
import { SummaryCard } from "./SummaryCard";
import { useAiActions } from "./useAiActions";
import { useRadarState } from "./useRadarState";

export function RadarApp() {
  const state = useRadarState();
  const { ready, config, analysis, selectedUnit } = state;
  const ai = useAiActions({
    analysis,
    roster: state.roster,
    catalog: state.catalog,
    config,
  });

  const steps: StepInfo[] = [
    { href: "#step-data", label: "Data", state: ready ? "done" : "current" },
    {
      href: "#step-rules",
      label: "Rules",
      state: !config ? "locked" : analysis ? "done" : "current",
    },
    {
      href: "#step-dashboard",
      label: "Dashboard",
      state: analysis ? (selectedUnit ? "done" : "current") : "locked",
    },
    { href: "#step-unit", label: "Unit panel", state: selectedUnit ? "current" : "locked" },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <div className="print:hidden">
        <Header
          canSummarize={analysis !== null}
          loading={ai.summaryState.status === "loading"}
          onSummary={ai.summary}
        />
      </div>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <div className="print:hidden">
          <Stepper steps={steps} />
        </div>
        <div className="space-y-6">
          <div className="print:hidden">
            <DataStep state={state} />
          </div>
          <div className="print:hidden">
            <RulesStep state={state} />
          </div>
          <DashboardStep state={state} />
          {ai.summaryState.status !== "idle" && config && analysis && (
            <SummaryCard ai={ai} analysis={analysis} config={config} />
          )}
          <div className="print:hidden">
            <UnitPanel state={state} ai={ai} />
          </div>
        </div>
      </main>
      <div className="print:hidden">
        <Footer />
      </div>
    </div>
  );
}
