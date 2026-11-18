"use client";

import { useEffect, useState } from "react";
import {
  buildCalendarCsv,
  buildCalendarView,
  calendarFileName,
  changedRunCount,
  filesKey,
  setupCollapsed,
  setupSummary,
} from "@/lib/analysis";
import { SetupHideButton, SetupSummaryBar } from "./SetupBar";
import { AppTabs, type AppTab } from "./AppTabs";
import { downloadTextFile } from "./download";
import { Banner, buttonClass } from "./ui";
import { CalendarTab } from "./CalendarTab";
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
  const [tab, setTab] = useState<AppTab>("radar");
  const { ready, config, analysis, selectedUnit } = state;
  const ai = useAiActions({
    analysis,
    roster: state.roster,
    catalog: state.catalog,
    config,
  });

  const edited = state.edits.length > 0;
  // The browser asks before leaving while what-if calendar changes would be lost (spec §4.11).
  useEffect(() => {
    if (!edited) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [edited]);
  const exportEdited = () => {
    if (!analysis || !config || !state.calendar) return;
    const view = buildCalendarView(state.calendar, analysis, config);
    downloadTextFile(calendarFileName(view.year), buildCalendarCsv(view));
  };

  // Steps 1 and 2 fold into a summary bar once everything is loaded and valid (spec §6, v2.10).
  // `openedFor` remembers that the user opened them for the files now loaded.
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  const setupInput = {
    ready,
    hasResults: analysis !== null,
    ruleErrors: Object.keys(state.issues).length,
    files: state.files,
    sampleLoading: state.sample.state === "loading",
  };
  const collapsed = setupCollapsed({ ...setupInput, openedFor });
  const canCollapse = setupCollapsed({ ...setupInput, openedFor: null });
  const openSetup = (scrollTo?: string) => {
    setOpenedFor(filesKey(state.files));
    if (scrollTo) setTimeout(() => document.getElementById(scrollTo)?.scrollIntoView({ block: "start" }), 0);
  };

  const steps: StepInfo[] = [
    {
      href: "#step-data",
      label: "Data",
      state: ready ? "done" : "current",
      onActivate: collapsed ? () => openSetup("step-data") : undefined,
    },
    {
      href: "#step-rules",
      label: "Rules",
      state: !config ? "locked" : analysis ? "done" : "current",
      onActivate: collapsed ? () => openSetup("step-rules") : undefined,
    },
    {
      href: "#step-dashboard",
      label: "Dashboard",
      state: analysis ? (selectedUnit ? "done" : "current") : "locked",
    },
    { href: "#step-unit", label: "Unit Panel", state: selectedUnit ? "current" : "locked" },
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
        {edited && (
          <div className="mb-4">
            <Banner tone="warning">
              <span className="font-semibold">What-if.</span> {changedRunCount(state.edits)}{" "}
              {changedRunCount(state.edits) === 1 ? "run" : "runs"} of the training calendar{" "}
              {changedRunCount(state.edits) === 1 ? "is" : "are"} changed. Every number on both tabs includes{" "}
              {changedRunCount(state.edits) === 1 ? "it" : "them"}, and nothing is saved.
              <span className="mt-2 flex flex-wrap gap-2 print:hidden">
                <button type="button" onClick={state.undoLastEdit} className={buttonClass("secondary")}>
                  Undo last change
                </button>
                <button type="button" onClick={state.resetEdits} className={buttonClass("secondary")}>
                  Reset to uploaded calendar
                </button>
                <button type="button" onClick={exportEdited} className={buttonClass("secondary")}>
                  Export calendar CSV
                </button>
              </span>
            </Banner>
          </div>
        )}
        <div className="print:hidden">
          <AppTabs active={tab} onChange={setTab} />
        </div>
        {tab === "calendar" ? (
          <div role="tabpanel" id="panel-calendar" aria-labelledby="tab-calendar">
            <CalendarTab state={state} onGoToData={() => setTab("radar")} />
          </div>
        ) : (
          <div role="tabpanel" id="panel-radar" aria-labelledby="tab-radar">
            <div className="print:hidden">
              <Stepper steps={steps} />
            </div>
            <div className="space-y-6">
              {collapsed && config ? (
                <div className="print:hidden">
                  <SetupSummaryBar {...setupSummary(state.files, config)} onShow={() => openSetup()} />
                </div>
              ) : (
                <div id="setup-steps" className="space-y-6 print:hidden">
                  {canCollapse && <SetupHideButton onHide={() => setOpenedFor(null)} />}
                  <DataStep state={state} />
                  <RulesStep state={state} />
                </div>
              )}
              <DashboardStep state={state} />
              {ai.summaryState.status !== "idle" && config && analysis && (
                <SummaryCard ai={ai} analysis={analysis} config={config} />
              )}
              <div className="print:hidden">
                <UnitPanel state={state} ai={ai} />
              </div>
            </div>
          </div>
        )}
      </main>
      <div className="print:hidden">
        <Footer />
      </div>
    </div>
  );
}
