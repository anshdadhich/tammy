"use client";

import { useId, useState } from "react";
import { X } from "lucide-react";
import { CANONICAL_SKILLS, normalizeSkill } from "@/lib/skills";

/**
 * Chip input for skills. Free entry normalized to canonical on add,
 * datalist suggestions from the canonical list, Enter/comma commits,
 * Backspace on empty removes the last chip.
 */
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
  const listId = `${fieldId}-list`;
  const [draft, setDraft] = useState("");

  const add = (raw: string) => {
    const n = normalizeSkill(raw);
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

  return (
    <div className="field">
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
      <input
        id={fieldId}
        className="input"
        list={listId}
        value={draft}
        placeholder={placeholder}
        maxLength={100}
        aria-invalid={error ? true : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => add(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
      />
      <datalist id={listId}>
        {CANONICAL_SKILLS.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      {hint && !error ? <span className="field-hint">{hint}</span> : null}
      {error ? (
        <span className="field-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
