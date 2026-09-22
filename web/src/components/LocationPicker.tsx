"use client";

import { useId, useRef, useState } from "react";
import { LOCATIONS } from "@/lib/skills";

/**
 * Single-value searchable location dropdown with all locations.
 * Type to filter, ArrowUp/Down + Enter to pick, Escape to close.
 * Unknown text can be added as Other.
 */
export default function LocationPicker({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hl, setHl] = useState(0);
  const uid = useId();
  const listId = `${uid}-loc-list`;
  const inputRef = useRef<HTMLInputElement>(null);

  const query = q.trim().toLowerCase();
  const trimmed = q.trim();
  const opts = LOCATIONS.filter(
    (s) => !query || s.toLowerCase().includes(query),
  ).slice(0, query ? 15 : 200);
  const exactHit = query ? LOCATIONS.some((s) => s.toLowerCase() === query) : false;
  const showCustom = trimmed.length > 0 && !exactHit;
  const total = opts.length + (showCustom ? 1 : 0);
  const hi = total ? Math.min(hl, total - 1) : 0;

  function pick(s: string) {
    onChange(s);
    setQ("");
    setHl(0);
    setOpen(false);
    inputRef.current?.blur();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      if (total) setHl((h) => (h + 1) % total);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (total) setHl((h) => (h - 1 + total) % total);
    } else if (e.key === "Enter") {
      if (hi < opts.length && opts[hi]) {
        e.preventDefault();
        pick(opts[hi]);
      } else if (showCustom && hi === opts.length) {
        e.preventDefault();
        pick(trimmed);
      }
    } else if (e.key === "Escape") {
      setQ("");
      setOpen(false);
    }
  }

  return (
    <div>
      {value ? (
        <div className="chips" style={{ marginBottom: 8 }}>
          <span className="chip">
            {value}
            <button
              type="button"
              onClick={() => {
                onChange("");
                setQ("");
                setHl(0);
                requestAnimationFrame(() => inputRef.current?.focus());
              }}
              aria-label={`remove ${value}`}
            >
              ×
            </button>
          </span>
        </div>
      ) : null}
      <div className="pick">
        <input
          ref={inputRef}
          className="input"
          value={q}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && hi < opts.length && opts[hi] ? `${listId}-${hi}` : undefined}
          autoComplete="off"
          onChange={(e) => {
            setQ(e.target.value);
            setHl(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          placeholder={value ? "Change location…" : (placeholder ?? "Search all locations…")}
        />
        {open ? (
          <ul className="picklist" id={listId} role="listbox">
            {!query && opts.length ? (
              <li className="pickcount" aria-hidden="true">
                {opts.length} of {LOCATIONS.length} — type to filter
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
                    pick(s);
                  }}
                >
                  {s}
                </button>
              </li>
            ))}
            {showCustom ? (
              <li role="option" aria-selected={hi === opts.length}>
                <button
                  type="button"
                  tabIndex={-1}
                  className={hi === opts.length ? "pick-hl" : ""}
                  onMouseEnter={() => setHl(opts.length)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(trimmed);
                  }}
                >
                  + Add &ldquo;{trimmed}&rdquo; (Other)
                </button>
              </li>
            ) : null}
            {!opts.length && !showCustom ? (
              <li className="pickempty">No locations match — try another name.</li>
            ) : null}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
