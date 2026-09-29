"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { jobSchema, toFieldErrors } from "@/lib/validators";
import {
  EXP_RANGES,
  MODE_LABEL,
  deriveTitle,
  flattenErrors,
  stageDefs,
  type Row,
  type Run,
  type Session,
  type SlState,
} from "./search-ui";
import ComposeView, { SearchHero } from "./compose-view";
import SessionLine from "./session-line";
import SearchingView from "./searching-view";
import { ResultsView } from "./results-view";

export default function SearchClient({
  initialSession,
}: {
  initialSession: Session | null;
}) {
  const [session, setSession] = useState<Session | null>(initialSession);
  const [prompt, setPrompt] = useState("");
  const [deep, setDeep] = useState(false);
  const [refineOpen, setRefineOpen] = useState(true);
  const [seniority, setSeniority] = useState("mid");
  const [mode, setMode] = useState("remote");
  const [expLabel, setExpLabel] = useState("Any");
  const [mustHave, setMustHave] = useState<string[]>([]);
  const [domain, setDomain] = useState("Software Development");
  const [employment, setEmployment] = useState("full-time");
  const [currency, setCurrency] = useState("INR");
  const [amount, setAmount] = useState("");
  const [relocation, setRelocation] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [runs, setRuns] = useState<Run[]>([]);
  const [activeRunId, setActiveRunId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sl, setSl] = useState<SlState>({});
  const [view, setView] = useState<"compose" | "searching" | "results">(
    "compose",
  );
  const [stage, setStage] = useState(0);
  const stageTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const nextRunId = useRef(1);

  const stages = stageDefs({
    deep,
    skills: mustHave.length,
    mode: MODE_LABEL[mode] ?? mode,
    exp: expLabel,
  });

  const clearErr = (key: string) =>
    setErrs((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });

  const resetFeedback = () => {
    setErrs({});
    setNotice(null);
  };

  const showRun = (r: Run) => {
    setActiveRunId(r.id);
    setSelectedId(r.results[0]?.id ?? null);
    setView("results");
  };

  const openRun = (id: number) => {
    const r = runs.find((x) => x.id === id);
    if (r) showRun(r);
  };

  const pickCandidate = (runId: number, rowId: string) => {
    setActiveRunId(runId);
    setSelectedId(rowId);
  };

  useEffect(
    () => () => {
      if (stageTimer.current) clearInterval(stageTimer.current);
    },
    [],
  );

  const run = async () => {
    if (busy) return;
    const text = prompt.trim();
    const range = EXP_RANGES.find((r) => r.label === expLabel) ?? EXP_RANGES[0];
    const amountNum = amount.trim() ? Number(amount.replace(/[,\s]/g, "")) : 0;
    const job = {
      title: deriveTitle(text),
      domain,
      seniority,
      must_have: mustHave,
      nice_to_have: [] as string[],
      min_exp: range.min,
      max_exp: range.max,
      salary_min: amountNum,
      currency,
      location: "",
      remote_policy: mode,
      relocation_allowed: relocation,
      employment_type: employment,
      description: text,
      responsibilities: "",
      screening_requirements: "",
    };

    const parsed = jobSchema.safeParse(job);
    if (!parsed.success) {
      setErrs(toFieldErrors(parsed.error));
      setNotice("Fix the highlighted fields.");
      return;
    }
    setErrs({});
    setNotice(null);
    setBusy(true);
    setStage(0);
    setView("searching");
    if (stageTimer.current) clearInterval(stageTimer.current);
    stageTimer.current = setInterval(() => {
      setStage((s) => Math.min(s + 1, stages.length - 1));
    }, 450);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job, limit: deep ? 10 : 30, deep }),
      });
      const body = (await res.json().catch(() => null)) as {
        results?: Row[];
        queryText?: string;
        cached?: boolean;
        deep?: boolean;
        deepError?: string;
        error?: string;
        errors?: unknown;
      } | null;

      if (res.status === 401) {
        setView("compose");
        setSession(null);
        return;
      }
      if (res.status === 429) {
        setView("compose");
        setNotice("Rate limit reached - take a short pause and try again.");
        return;
      }
      if (res.status === 400 && body?.errors) {
        setView("compose");
        setErrs(flattenErrors(body.errors));
        setNotice("Fix the highlighted fields.");
        return;
      }
      if (!res.ok) {
        setView("compose");
        setNotice(body?.error || "Search failed - try again.");
        return;
      }
      const rows: Row[] = Array.isArray(body?.results) ? body.results : [];
      const entry: Run = {
        id: nextRunId.current++,
        title: deriveTitle(text),
        prompt: text,
        results: rows,
        meta: {
          queryText: typeof body?.queryText === "string" ? body.queryText : "",
          cached: body?.cached === true,
          deep: body?.deep === true,
        },
        deepError: typeof body?.deepError === "string" ? body.deepError : null,
        ranAt: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
      setRuns((prev) => [entry, ...prev]);
      setActiveRunId(entry.id);
      setSelectedId(rows[0]?.id ?? null);
      setView("results");
    } catch {
      setView("compose");
      setNotice("Network error - try again.");
    } finally {
      if (stageTimer.current) {
        clearInterval(stageTimer.current);
        stageTimer.current = null;
      }
      setBusy(false);
    }
  };

  const shortlist = async (id: string) => {
    if (sl[id]) return;
    setSl((s) => ({ ...s, [id]: "saving" }));
    try {
      const res = await fetch("/api/shortlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate_id: id }),
      });
      if (res.status === 401) {
        setSession(null);
        setSl((s) => {
          const next = { ...s };
          delete next[id];
          return next;
        });
        return;
      }
      if (res.ok) {
        setSl((s) => ({ ...s, [id]: "saved" }));
        return;
      }
      if (res.status === 429)
        setNotice("Shortlist rate limit - pause a moment and retry.");
      setSl((s) => ({ ...s, [id]: "error" }));
    } catch {
      setSl((s) => ({ ...s, [id]: "error" }));
    }
  };

  if (!session) {
    return (
      <div className="max-w-xl mx-auto px-6 pt-16 lg:pt-24 pb-24">
        <div className="rounded-2xl bg-surface shadow-soft-md p-7 sm:p-9 text-center">
          <div className="w-11 h-11 rounded-full bg-brand-soft text-brand-text grid place-items-center mx-auto">
            <Search size={20} aria-hidden="true" />
          </div>
          <h2 className="mt-5 text-[22px] font-semibold tracking-[-0.01em] text-ink">
            Employer session required.
          </h2>
          <p className="mt-3 text-[15px] leading-[1.6] text-body">
            Results carry candidate contact channels, so searches sit behind a
            per-device employer session - one email opens it.
          </p>
          <Link href="/hire/login" className="btn btn-primary press mt-6">
            Open a session <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className={
        view === "results"
          ? "w-full px-4 sm:px-6 lg:px-10 pb-24 pt-4"
          : view === "searching"
            ? "max-w-[860px] mx-auto px-6 pb-24 pt-10 min-h-[68vh] flex flex-col justify-center"
            : "max-w-[860px] mx-auto px-6 pb-24"
      }
    >
      {view === "compose" ? (
        <>
          <SearchHero />
          <SessionLine session={session} />
        </>
      ) : null}

      {view === "compose" ? (
        <ComposeView
          prompt={prompt}
          setPrompt={setPrompt}
          deep={deep}
          setDeep={setDeep}
          refineOpen={refineOpen}
          setRefineOpen={setRefineOpen}
          seniority={seniority}
          setSeniority={setSeniority}
          mode={mode}
          setMode={setMode}
          expLabel={expLabel}
          setExpLabel={setExpLabel}
          mustHave={mustHave}
          setMustHave={setMustHave}
          domain={domain}
          setDomain={setDomain}
          employment={employment}
          setEmployment={setEmployment}
          currency={currency}
          setCurrency={setCurrency}
          amount={amount}
          setAmount={setAmount}
          relocation={relocation}
          setRelocation={setRelocation}
          errs={errs}
          clearErr={clearErr}
          resetFeedback={resetFeedback}
          notice={notice}
          busy={busy}
          onSubmit={() => void run()}
          lastRun={runs[0] ?? null}
          onShowLast={() => showRun(runs[0])}
        />
      ) : view === "searching" ? (
        <SearchingView
          title={deriveTitle(prompt.trim())}
          brief={prompt.trim()}
          deep={deep}
          stage={stage}
          stages={stages}
        />
      ) : (
        <ResultsView
          runs={runs}
          activeRunId={activeRunId}
          selectedId={selectedId}
          sl={sl}
          onRun={openRun}
          onPick={pickCandidate}
          onShortlist={(id) => void shortlist(id)}
          onNew={() => setView("compose")}
        />
      )}
    </div>
  );
}
