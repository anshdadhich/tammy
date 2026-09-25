import {
  Stepper,
  StepperDescription,
  StepperIndicator,
  StepperItem,
  StepperTitle,
} from "@/components/ui/stepper";

export type ProcessStep = {
  n: string;
  title: string;
  desc: string;
};

export default function ProcessSteps({ steps }: { steps: ProcessStep[] }) {
  return (
    <Stepper
      role="list"
      orientation="vertical"
      className="!grid w-full grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-5"
    >
      {steps.map((d, i) => (
        <StepperItem
          key={d.n}
          step={i + 1}
          role="listitem"
          className="relative isolate min-w-0 overflow-hidden rounded-2xl border border-line bg-inset p-5 !items-start"
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-2 -top-3 -z-10 select-none font-mono text-[64px] font-semibold leading-none tracking-[-0.04em] text-brand-text opacity-10"
          >
            {d.n}
          </span>
          <StepperIndicator asChild>
            <span>{d.n}</span>
          </StepperIndicator>
          <StepperTitle className="mt-4">{d.title}</StepperTitle>
          <StepperDescription className="mt-1.5">{d.desc}</StepperDescription>
        </StepperItem>
      ))}
    </Stepper>
  );
}
