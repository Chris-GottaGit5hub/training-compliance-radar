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
import { Banner } from "./ui";

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
      <Header
        canSummarize={analysis !== null && !ai.notConfigured}
        disabledReason={
          ai.notConfigured ? "AI is not configured on this server" : "Load data and rules first"
        }
        loading={ai.summaryState.status === "loading"}
        onSummary={ai.summary}
      />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Stepper steps={steps} />
        {ai.notConfigured && (
          <div className="mb-4">
            <Banner tone="warning">
              AI is not configured on this server. Memos, recommendations and the executive summary are
              off; everything else works.
            </Banner>
          </div>
        )}
        <div className="space-y-6">
          <DataStep state={state} />
          <RulesStep state={state} />
          <DashboardStep state={state} />
          {ai.summaryState.status !== "idle" && config && (
            <SummaryCard ai={ai} asOfDate={config.asOfDate} />
          )}
          <UnitPanel state={state} ai={ai} />
        </div>
      </main>
      <Footer />
    </div>
  );
}
