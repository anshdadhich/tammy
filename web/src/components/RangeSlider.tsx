"use client";

import * as Slider from "@radix-ui/react-slider";

export default function RangeSlider({
  min,
  max,
  step,
  value,
  onChange,
  format,
  ariaLabel,
  single,
  ticks,
  bare,
}: {
  min: number;
  max: number;
  step: number;
  value: [number, number];
  onChange: (v: [number, number]) => void;
  format?: (v: number) => string;
  ariaLabel?: string;
  single?: boolean;
  ticks?: string[];
  bare?: boolean;
}) {
  const vals = single ? [value[0]] : value;
  return (
    <div className="range">
      <Slider.Root
        className="relative flex h-8 w-full items-center select-none touch-none"
        min={min}
        max={max}
        step={step}
        value={vals}
        onValueChange={(v) => {
          if (single) onChange([v[0] ?? min, value[1]]);
          else onChange([v[0] ?? min, v[1] ?? max]);
        }}
        minStepsBetweenThumbs={0}
        aria-label={ariaLabel}
      >
        <Slider.Track className="relative h-[8px] w-full grow overflow-hidden rounded-full bg-[#E6EAF0]">
          <Slider.Range className="absolute h-full bg-[#1F2DE6] rounded-full" />
        </Slider.Track>
        <Slider.Thumb
          className="block h-6 w-6 rounded-full border-2 border-white bg-white shadow-[0_2px_8px_rgba(15,23,42,0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F2DE6]/20"
          aria-label={single ? (ariaLabel ?? "Value") : "Minimum"}
        />
        {single ? null : (
          <Slider.Thumb
            className="block h-6 w-6 rounded-full border-2 border-white bg-white shadow-[0_2px_8px_rgba(15,23,42,0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F2DE6]/20"
            aria-label="Maximum"
          />
        )}
      </Slider.Root>
      {bare ? null : ticks ? (
        <div className="range-ticks" aria-hidden="true">
          {ticks.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      ) : (
        <div className="range-ends" aria-hidden="true">
          <span>{format ? format(value[0]) : value[0]}</span>
          <span>{format ? format(value[1]) : value[1]}</span>
        </div>
      )}
    </div>
  );
}
