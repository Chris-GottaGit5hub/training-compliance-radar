"use client";

import { DashboardStep } from "./DashboardStep";
import { DataStep } from "./DataStep";
import { Footer } from "./Footer";
import { Header } from "./Header";
import { RulesStep } from "./RulesStep";
import { Stepper, type StepInfo } from "./Stepper";
import { useRadarState } from "./useRadarState";

export function RadarApp() {
  const state = useRadarState();
  const { ready, config, analysis, selectedUnit } = state;

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
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Stepper steps={steps} />
        <div className="space-y-6">
          <DataStep state={state} />
          <RulesStep state={state} />
          <DashboardStep state={state} />
        </div>
      </main>
      <Footer />
    </div>
  );
}
