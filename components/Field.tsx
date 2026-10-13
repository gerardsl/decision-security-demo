import type { ChangeEvent } from "react";

type FieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  error?: string;
  multiline?: boolean;
  optional?: boolean;
  rows?: number;
  autoComplete?: string;
};

const controlClass =
  "w-full rounded-md border border-white/10 bg-[#0b1220] px-3 py-2 text-sm text-slate-100 shadow-inner outline-none placeholder:text-slate-500 focus-visible:border-cyan-300 focus-visible:ring-2 focus-visible:ring-cyan-300/40";

export function Field({
  id,
  label,
  value,
  onChange,
  maxLength,
  error,
  multiline = false,
  optional = false,
  rows = 5,
  autoComplete = "off",
}: FieldProps) {
  const errorId = `${id}-error`;
  const shared = {
    id,
    value,
    maxLength,
    autoComplete,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? errorId : undefined,
    className: `${controlClass} ${multiline ? "min-h-28 resize-y font-mono text-[13px] leading-5" : ""}`,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(event.target.value),
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-slate-200">
        {label}
        {optional ? <span className="ml-2 font-normal text-slate-400">Optional</span> : null}
      </label>
      {multiline ? <textarea {...shared} rows={rows} /> : <input {...shared} type="text" />}
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-rose-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
