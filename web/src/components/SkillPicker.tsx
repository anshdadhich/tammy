"use client";

import { useState } from "react";
import { CANONICAL_SKILLS } from "@/lib/skills";

/**
 * Canonical-only skill picker. Free text is deliberately NOT allowed:
 * only recognized skills persist to candidate_skills, so the dropdown
 * is what keeps normalization (and matching) good.
 */
export default function SkillPicker({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const query = q.trim().toLowerCase();
  const opts = CANONICAL_SKILLS.filter(
    (s) =>
      !value.some((v) => v.toLowerCase() === s.toLowerCase()) &&
      (!query || s.toLowerCase().includes(query)),
  ).slice(0, 9);

  function add(s: string) {
    onChange([...value, s]);
    setQ("");
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
      <div className="pick">
        <input
          className="input"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          placeholder={placeholder ?? "Search recognized skills…"}
        />
        {open ? (
          <ul className="picklist">
            {opts.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    add(s);
                  }}
                >
                  {s}
                </button>
              </li>
            ))}
            {!opts.length ? (
              <li className="pickempty">
                {query ? "No recognized skill matches — try another name." : "All recognized skills already added."}
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
