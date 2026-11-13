import { Label } from "@/components/ui/label";

export interface SegmentedRadioOption<T extends string> {
  value: T;
  label: string;
  /** Give a longer label more room than its neighbours. */
  wide?: boolean;
}

interface SegmentedRadioProps<T extends string> {
  /** Visible label for the group. */
  label: string;
  /**
   * Prefix for the generated ids: the group is named `<idPrefix>-type`, its label
   * is `<idPrefix>-type-label` and each option's input is `<idPrefix>-<value>`.
   */
  idPrefix: string;
  options: readonly SegmentedRadioOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/**
 * Radio buttons drawn as a row of segments. The inputs are visually hidden, so
 * they keep native keyboard and screen reader behaviour while the labels are
 * what the user sees and clicks.
 */
export function SegmentedRadio<T extends string>({
  label,
  idPrefix,
  options,
  value,
  onChange,
}: SegmentedRadioProps<T>) {
  const labelId = `${idPrefix}-type-label`;
  return (
    <div className="flex flex-col gap-2.5">
      <Label id={labelId}>{label}</Label>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className="flex w-full flex-nowrap gap-1 overflow-x-auto rounded-md bg-neutral-100 p-1 dark:bg-neutral-800"
      >
        {options.map((option) => (
          <div
            key={option.value}
            className={option.wide ? "min-w-fit flex-[1.3]" : "min-w-fit flex-1"}
          >
            <input
              type="radio"
              id={`${idPrefix}-${option.value}`}
              name={`${idPrefix}-type`}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="peer sr-only"
            />
            <label
              htmlFor={`${idPrefix}-${option.value}`}
              className="flex cursor-pointer items-center justify-center whitespace-nowrap rounded-md px-2 py-2 text-center text-sm font-medium text-neutral-500 transition hover:bg-neutral-200 hover:text-neutral-700 peer-checked:bg-neutral-800 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 dark:text-neutral-400 dark:hover:bg-neutral-900 dark:hover:text-neutral-300 dark:peer-checked:bg-neutral-950 dark:peer-checked:text-white"
            >
              {option.label}
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}
