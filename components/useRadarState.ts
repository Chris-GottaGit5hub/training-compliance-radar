"use client";

import { useCallback, useMemo, useState } from "react";
import {
  EMPTY_FILE,
  configErrors,
  initialConfigFor,
  isOversized,
  oversizedState,
  runAnalysis,
  stateFromResult,
  type Analysis,
  type FileState,
} from "@/lib/analysis";
import { todayManila } from "@/lib/engine";
import {
  validateCsv,
  type AttendanceRow,
  type CatalogRow,
  type CsvKind,
  type RosterRow,
  type RulesConfig,
} from "@/lib/schemas";

interface Files {
  roster: FileState<RosterRow>;
  attendance: FileState<AttendanceRow>;
  catalog: FileState<CatalogRow>;
}

export type SampleStatus = { state: "idle" | "loading" } | { state: "error"; message: string };

const KINDS: CsvKind[] = ["roster", "attendance", "catalog"];
const NO_FILES: Files = { roster: EMPTY_FILE, attendance: EMPTY_FILE, catalog: EMPTY_FILE };

/** All page state. Data never leaves the browser; nothing here calls an API. */
export function useRadarState() {
  const [files, setFiles] = useState<Files>(NO_FILES);
  const [source, setSource] = useState<"sample" | "upload" | null>(null);
  // Set from an event handler, never during render (keeps render pure).
  const [today, setToday] = useState<string | null>(null);
  const [edited, setEdited] = useState<RulesConfig | null>(null);
  const [pending, setPending] = useState<Partial<Record<CsvKind, boolean>>>({});
  const [sample, setSample] = useState<SampleStatus>({ state: "idle" });
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);

  const roster = files.roster.status === "ok" ? files.roster.rows : null;
  const attendance = files.attendance.status === "ok" ? files.attendance.rows : null;
  const catalog = files.catalog.status === "ok" ? files.catalog.rows : null;
  const ready = roster !== null && attendance !== null;

  const config = useMemo<RulesConfig | null>(() => {
    if (edited) return edited;
    if (!roster || !today || !source) return null;
    return initialConfigFor(source, roster, today);
  }, [edited, roster, today, source]);

  const issues = useMemo(() => (config ? configErrors(config) : {}), [config]);
  const issueCount = Object.keys(issues).length;

  const run = useMemo<{ analysis: Analysis | null; error: string | null }>(() => {
    if (!ready || !config || issueCount > 0) return { analysis: null, error: null };
    try {
      return { analysis: runAnalysis({ roster, attendance, catalog, config }), error: null };
    } catch (error) {
      return { analysis: null, error: error instanceof Error ? error.message : "Analysis failed" };
    }
  }, [ready, roster, attendance, catalog, config, issueCount]);

  const loadFile = useCallback(async (kind: CsvKind, file: File) => {
    setPending((p) => ({ ...p, [kind]: true }));
    try {
      const state = isOversized(file.size)
        ? oversizedState(file.name)
        : stateFromResult(validateCsv(kind, await file.text()), file.name);
      setFiles((prev) => ({ ...prev, [kind]: state }));
      setSource((prev) => prev ?? "upload");
      setToday((prev) => prev ?? todayManila());
    } finally {
      setPending((p) => ({ ...p, [kind]: false }));
    }
  }, []);

  const clearFile = useCallback((kind: CsvKind) => {
    setFiles((prev) => ({ ...prev, [kind]: EMPTY_FILE }));
  }, []);

  const loadSample = useCallback(async () => {
    setSample({ state: "loading" });
    try {
      const texts = await Promise.all(
        KINDS.map(async (kind) => {
          const res = await fetch(`/sample/${kind}.csv`);
          if (!res.ok) throw new Error(`Could not load ${kind}.csv (HTTP ${res.status}).`);
          return res.text();
        }),
      );
      const [r, a, c] = texts;
      setFiles({
        roster: stateFromResult(validateCsv("roster", r), "roster.csv (sample)"),
        attendance: stateFromResult(validateCsv("attendance", a), "attendance.csv (sample)"),
        catalog: stateFromResult(validateCsv("catalog", c), "catalog.csv (sample)"),
      });
      setSource("sample");
      setToday(todayManila());
      setEdited(null);
      setSelectedUnit(null);
      setSample({ state: "idle" });
    } catch (error) {
      setSample({
        state: "error",
        message: error instanceof Error ? error.message : "Could not load the sample data.",
      });
    }
  }, []);

  return {
    files,
    pending,
    sample,
    ready,
    config,
    issues,
    analysis: run.analysis,
    analysisError: run.error,
    roster,
    catalog,
    selectedUnit,
    loadFile,
    clearFile,
    loadSample,
    setConfig: setEdited,
    selectUnit: setSelectedUnit,
  };
}
