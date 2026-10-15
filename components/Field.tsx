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

const controlClass = "field-control";

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
    className: `${controlClass} ${multiline ? "font-mono text-[13px] leading-5" : ""}`,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(event.target.value),
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
        {optional ? <span className="ml-2 font-normal text-muted">Optional</span> : null}
      </label>
      {multiline ? <textarea {...shared} rows={rows} /> : <input {...shared} type="text" />}
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
