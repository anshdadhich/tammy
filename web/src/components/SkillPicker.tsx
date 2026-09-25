"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { CANONICAL_SKILLS, normalizeSkill } from "@/lib/skills";

export default function SkillPicker({
  id,
  label,
  required,
  hint,
  error,
  value,
  onChange,
  placeholder = "Type a skill and press Enter",
  max = 50,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  max?: number;
}) {
  const autoId = useId();
  const fieldId = id || autoId;
  const listId = `${fieldId}-listbox`;
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const add = (raw: string) => {
    const n = normalizeSkill(raw);
    setOpen(false);
    if (!n) return;
    if (value.length >= max) return;
    if (value.some((v) => v.toLowerCase() === n.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...value, n]);
    setDraft("");
  };

  const remove = (skill: string) => onChange(value.filter((v) => v !== skill));

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const wrap = wrapRef.current;
      const t = e.target;
      if (wrap && (!(t instanceof Node) || !wrap.contains(t))) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, wrapRef]);

  const q = draft.trim().toLowerCase();
  const pool = q
    ? CANONICAL_SKILLS.filter((s) => s.toLowerCase().includes(q))
    : CANONICAL_SKILLS;
  const matches = pool.filter(
    (s) => !value.some((v) => v.toLowerCase() === s.toLowerCase()),
  );
  const ai = matches.length ? Math.min(active, matches.length - 1) : -1;

  useEffect(() => {
    if (ai < 0) return;
    const panel = document.getElementById(listId);
    const el = panel?.querySelector<HTMLElement>(`[data-idx="${ai}"]`);
    if (!panel || !el) return;
    const top = el.offsetTop;
    const bottom = top + el.offsetHeight;
    if (top < panel.scrollTop) panel.scrollTop = top;
    else if (bottom > panel.scrollTop + panel.clientHeight)
      panel.scrollTop = bottom - panel.clientHeight;
  }, [listId, ai]);

  return (
    <div className="field content-start">
      <label className="field-label" htmlFor={fieldId}>
        {label}
        {required ? <span className="req" aria-hidden="true">*</span> : null}
      </label>
      {value.length > 0 ? (
        <div className="chips">
          {value.map((s) => (
            <span className="chip" key={s}>
              {s}
              <button
                type="button"
                className="chip-x"
                onClick={() => remove(s)}
                aria-label={`Remove ${s}`}
              >
                <X aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div
        className="relative"
        ref={wrapRef}
        onBlur={(e) => {
          const next = e.relatedTarget;
          if (!next || !e.currentTarget.contains(next)) close();
        }}
      >
        <input
          id={fieldId}
          className="input"
          style={{ paddingRight: 38 }}
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={open && ai >= 0 ? `${listId}-${ai}` : undefined}
          value={draft}
          placeholder={placeholder}
          maxLength={100}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          onFocus={() => {
            if (!open) {
              setOpen(true);
              setActive(0);
            }
          }}
          onClick={() => {
            if (!open) {
              setOpen(true);
              setActive(0);
            }
          }}
          onChange={(e) => {
            setDraft(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onBlur={() => add(draft)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              if (open && ai >= 0) add(matches[ai]);
              else add(draft);
            } else if (e.key === "Backspace" && !draft && value.length) {
              onChange(value.slice(0, -1));
            } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              if (!open) {
                setOpen(true);
                setActive(
                  e.key === "ArrowDown" ? 0 : Math.max(0, matches.length - 1),
                );
              } else if (matches.length) {
                setActive(
                  Math.min(
                    Math.max(e.key === "ArrowDown" ? ai + 1 : ai - 1, 0),
                    matches.length - 1,
                  ),
                );
              }
            } else if (e.key === "Escape" && open) {
              e.preventDefault();
              close();
            }
          }}
        />
        <ChevronDown
          size={16}
          aria-hidden="true"
          className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted"
        />
        {open ? (
          <div
            id={listId}
            role="listbox"
            className="absolute left-0 right-0 top-full z-30 mt-1.5 max-h-60 overflow-y-auto rounded-[14px] border border-line bg-surface shadow-soft-md py-1.5"
          >
            {matches.length === 0 ? (
              <div
                role="option"
                aria-selected={false}
                className="px-3.5 py-2 text-[13.5px] text-muted"
              >
                {value.length >= max ? "Skill limit reached" : "No matches"}
              </div>
            ) : (
              matches.map((s, i) => (
                <button
                  key={s}
                  type="button"
                  role="option"
                  id={`${listId}-${i}`}
                  data-idx={i}
                  aria-selected={i === ai}
                  tabIndex={-1}
                  className={`block w-full cursor-pointer border-0 px-3.5 py-2 text-left text-[14px] leading-[1.45] ${
                    i === ai ? "bg-inset text-ink" : "bg-transparent text-body"
                  }`}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => add(s)}
                >
                  {s}
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>
      {hint && !error ? <span className="field-hint">{hint}</span> : null}
      {error ? (
        <span className="field-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
