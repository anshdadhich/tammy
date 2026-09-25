import { AnimatePresence, motion } from "motion/react";
import { Info } from "lucide-react";
import Avatar from "@/components/Avatar";
import {
  AVAIL_LABEL,
  LEVEL_LABEL,
  levelOfRow,
  type Row,
  type Run,
  type SlState,
} from "./search-ui";
import CandidateDetail from "./candidate-detail";

const scoreOf = (row: Row): number | null =>
  typeof row.overall_score === "number" && Number.isFinite(row.overall_score)
    ? Math.round(row.overall_score)
    : null;

type ResultsViewProps = {
  runs: Run[];
  activeRunId: number | null;
  selectedId: string | null;
  sl: SlState;
  onRun: (id: number) => void;
  onPick: (runId: number, rowId: string) => void;
  onShortlist: (id: string) => void;
  onNew: () => void;
};

function CandidateRow({
  row,
  index,
  selected,
  onPick,
}: {
  row: Row;
  index: number;
  selected: boolean;
  onPick: () => void;
}) {
  const level = levelOfRow(row);
  const score = scoreOf(row);
  return (
    <button
      type="button"
      className="sq-cand"
      data-sel={selected ? "true" : undefined}
      aria-pressed={selected}
      onClick={onPick}
    >
      <span className="sq-rank">{index + 1}</span>
      <Avatar name={row.full_name ?? "Candidate"} src={row.photo_url} size={32} />
      <span className="sq-cand-body">
        <span className="sq-cand-name">{row.full_name ?? "Candidate"}</span>
        <span className="sq-cand-sub">
          <span className="sq-dot" data-level={level ?? "none"} aria-hidden="true" />
          <span className="sq-cand-lvl">
            {level ? LEVEL_LABEL[level] : "Unscored"}
            {row.availability_status && AVAIL_LABEL[row.availability_status]
              ? ` · ${AVAIL_LABEL[row.availability_status]}`
              : ""}
          </span>
        </span>
      </span>
      <span className="sq-cand-side">
        <span className="sq-cand-num">{score ?? "—"}</span>
        <span className="sq-cand-bar">
          <i style={{ width: `${score ?? 0}%` }} />
        </span>
      </span>
    </button>
  );
}

export function ResultsView({
  runs,
  activeRunId,
  selectedId,
  sl,
  onRun,
  onPick,
  onShortlist,
  onNew,
}: ResultsViewProps) {
  const run = runs.find((r) => r.id === activeRunId) ?? null;
  const selected = run?.results.find((r) => r.id === selectedId) ?? null;

  return (
    <div className="sq-results">
      <aside className="sq-side" aria-label="Search history">
        <div className="sq-side-head">
          <button type="button" className="btn btn-primary sq-side-new" onClick={onNew}>
            New search
          </button>
        </div>
        <div className="sq-side-scroll [scrollbar-width:thin] [scrollbar-color:#8E96A8_transparent] [&::-webkit-scrollbar]:h-[8px] [&::-webkit-scrollbar]:w-[8px] [&::-webkit-scrollbar]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#8E96A8] [&::-webkit-scrollbar-thumb:hover]:bg-[#6C7484]">
          {runs.length === 0 && (
            <p className="empty-note">No searches yet. Your runs will land here.</p>
          )}
          {runs.map((r) => {
            const isRun = r.id === activeRunId;
            return (
              <div className="sq-run min-w-0" data-sel={isRun ? "true" : undefined} key={r.id}>
                <button
                  type="button"
                  className="sq-run-head"
                  aria-current={isRun ? "true" : undefined}
                  onClick={() => onRun(r.id)}
                >
                  <span className="sq-run-title">{r.title}</span>
                  <span className="sq-run-meta">
                    <span className="sq-run-time">{r.ranAt}</span>
                    <span className="sq-run-badge">{r.results.length}</span>
                  </span>
                </button>
                {isRun ? (
                  <div className="sq-run-cands">
                    {r.results.map((row, i) => (
                      <CandidateRow
                        key={row.id}
                        row={row}
                        index={i}
                        selected={row.id === selectedId}
                        onPick={() => onPick(r.id, row.id)}
                      />
                    ))}
                    {r.results.length === 0 && (
                      <p className="empty-note">No matches in this run.</p>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </aside>

      <section className="sq-detail">
        <header className="sq-results-head">
          <div className="sq-head-text">
            <span className="sq-overline">Shortlist</span>
            <h2 className="sq-results-title">
              {run ? run.title : "Search results"}
              <span className="sq-count">{run ? run.results.length : 0}</span>
            </h2>
            <p className="sq-head-meta">
              {run
                ? `Last run ${run.ranAt}${run.meta.cached ? " · replayed saved run" : ""} · ${
                    run.meta.deep ? "Deep read on" : "Deep read off"
                  }`
                : "Runs appear here after a search"}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm sq-head-new"
            onClick={onNew}
          >
            New search
          </button>
        </header>

        {run?.deepError ? (
          <div className="notice notice-warn sq-deep-note" role="status">
            <Info aria-hidden="true" />
            <span>
              <strong className="sq-deep-note-title">
                Deep Read fell back to standard scoring.
              </strong>
              <span className="sq-deep-note-body">{run.deepError}</span>
            </span>
          </div>
        ) : null}

        <div className="sq-detail-body">
          {!run && (
            <div className="sq-empty">
              <p className="sq-empty-title">No run selected</p>
              <p className="sq-empty-note">
                Pick a past search on the left, or start a new one.
              </p>
              <button type="button" className="btn btn-primary" onClick={onNew}>
                New search
              </button>
            </div>
          )}

          {run && run.results.length === 0 && (
            <div className="sq-empty">
              <p className="sq-empty-title">No candidates matched</p>
              <p className="sq-empty-note">
                Nothing cleared the bar for this brief. Loosen a constraint and
                search again.
              </p>
              <button type="button" className="btn btn-primary" onClick={onNew}>
                Adjust the brief
              </button>
            </div>
          )}

          {run && run.results.length > 0 && !selected && (
            <div className="sq-empty">
              <p className="sq-empty-title">Pick a candidate</p>
              <p className="sq-empty-note">
                Select someone from the list to read their analysis.
              </p>
            </div>
          )}

          <AnimatePresence mode="wait">
            {selected && (
              <motion.div
                key={`${run?.id ?? ""}:${selected.id}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              >
                <CandidateDetail
                  row={selected}
                  sl={sl[selected.id]}
                  onShortlist={onShortlist}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>
    </div>
  );
}


