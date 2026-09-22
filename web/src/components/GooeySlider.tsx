"use client";

type Props = {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
};

export default function GooeySlider({ label, value, display, min, max, step, onChange }: Props) {
  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100;
  return (
    <div className="field">
      <label>
        {label} <span className="sliderval">{display}</span>
      </label>
      <div className="relative flex h-8 items-center select-none touch-none">
        <div className="absolute left-0 right-0 h-[8px] rounded-full bg-[#E6EAF0] overflow-hidden">
          <div className="h-full bg-[#1F2DE6] rounded-full" style={{ width: `${pct}%` }} />
        </div>
        <div
          className="absolute h-6 w-6 rounded-full bg-white border-2 border-white shadow-[0_2px_8px_rgba(15,23,42,0.14)]"
          style={{ left: `calc(${pct}% - 12px)` }}
          aria-hidden="true"
        />
        <input
          type="range"
          className="absolute inset-0 w-full h-8 opacity-0 cursor-pointer"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={label}
        />
      </div>
      <div className="slidermarks">
        <span>{min}</span>
        <span>{max >= 1000 ? `${Math.round(max / 1000)}k` : max}</span>
      </div>
    </div>
  );
}
