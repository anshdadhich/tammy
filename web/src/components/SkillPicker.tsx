"use client";

import { useId, useState } from "react";
import { CANONICAL_SKILLS } from "@/lib/skills";

/**
 * Canonical-only skill picker. Free text is deliberately NOT allowed:
 * only recognized skills persist to candidate_skills, so the dropdown
 * is what keeps normalization (and matching) good.
 *
 * Behaves like a standard combobox: ArrowUp/Down moves the highlight,
 * Enter picks, Escape closes. Mouse + touch unchanged.
 */
export default function SkillPicker({
  value,
  onChange,
  placeholder,
  showAdd,
  suggestions,
  options,
  allowCustom,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  /** Show an inline "+ Add" button and quick-add suggestion pills. */
  showAdd?: boolean;
  suggestions?: string[];
  options?: string[];
  /** Allow adding typed text not in the list (e.g. Other city / custom skill). */
  allowCustom?: boolean;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hl, setHl] = useState(0);
  const uid = useId();
  const listId = `${uid}-skill-list`;

  const source = options ?? CANONICAL_SKILLS;
  const query = q.trim().toLowerCase();
  const trimmed = q.trim();
  const exactInList = query ? source.some((s) => s.toLowerCase() === query) : false;
  const alreadyAdded = query ? value.some((v) => v.toLowerCase() === query) : false;
  const showCustomRow = allowCustom && trimmed.length > 0 && !exactInList && !alreadyAdded;
  const opts = source.filter(
    (s) =>
      !value.some((v) => v.toLowerCase() === s.toLowerCase()) &&
      (!query || s.toLowerCase().includes(query)),
  ).slice(0, query ? 12 : 200);
  // highlight index covers opts + optional custom row at the end
  const totalRows = opts.length + (showCustomRow ? 1 : 0);
  const hi = totalRows ? Math.min(hl, totalRows - 1) : 0;

  function add(s: string) {
    onChange([...value, s]);
    setQ("");
    setHl(0);
    setOpen(true);
  }

  function addVisible() {
    if (hi < opts.length) {
      const s = opts[hi];
      if (s) add(s);
    } else if (showCustomRow) {
      add(trimmed);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      if (totalRows) setHl((h) => (h + 1) % totalRows);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (totalRows) setHl((h) => (h - 1 + totalRows) % totalRows);
    } else if (e.key === "Enter") {
      if (hi < opts.length && opts[hi]) {
        e.preventDefault();
        add(opts[hi]);
      } else if (showCustomRow && hi === opts.length) {
        e.preventDefault();
        add(trimmed);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div>
      {value.length ? (
        <div className="chips" style={{ marginBottom: 8 }}>
          {value.map((s) => (
            <span className="chip" key={s}>
              {s}
              <button
                type="button"
                onClick={() => onChange(value.filter((x) => x !== s))}
                aria-label={`remove ${s}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className={showAdd ? "pick-addwrap" : "pick"}>
        <input
          className="input"
          value={q}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && opts[hi] ? `${listId}-${hi}` : undefined}
          autoComplete="off"
          onChange={(e) => {
            setQ(e.target.value);
            setHl(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          placeholder={placeholder ?? "Search recognized skills…"}
        />
        {showAdd ? (
          <button
            type="button"
            className="pick-add"
            disabled={!opts[hi]}
            onClick={addVisible}
          >
            + Add
          </button>
        ) : null}
        {open ? (
          <ul className="picklist" id={listId} role="listbox">
            {!query && opts.length ? (
              <li className="pickcount" aria-hidden="true">
                {opts.length} of {source.length} — type to filter
              </li>
            ) : null}
            {opts.map((s, i) => (
              <li key={s} role="option" id={`${listId}-${i}`} aria-selected={i === hi}>
                <button
                  type="button"
                  tabIndex={-1}
                  className={i === hi ? "pick-hl" : ""}
                  onMouseEnter={() => setHl(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    add(s);
                  }}
                >
                  {s}
                </button>
              </li>
            ))}
            {showCustomRow ? (
              <li key="__custom" role="option" id={`${listId}-${opts.length}`} aria-selected={hi === opts.length}>
                <button
                  type="button"
                  tabIndex={-1}
                  className={hi === opts.length ? "pick-hl" : ""}
                  onMouseEnter={() => setHl(opts.length)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    add(trimmed);
                  }}
                >
                  + Add &ldquo;{trimmed}&rdquo; (Other)
                </button>
              </li>
            ) : null}
            {!opts.length && !showCustomRow ? (
              <li className="pickempty">
                {query ? "No recognized skill matches — try another name." : "All recognized skills already added."}
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
      {suggestions?.length ? (
        <div className="pick-sugg">
          <span>Suggestions:</span>
          {suggestions
            .filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase()))
            .map((s) => (
              <button key={s} type="button" onClick={() => add(s)}>
                + {s}
              </button>
            ))}
        </div>
      ) : null}
    </div>
  );
}
