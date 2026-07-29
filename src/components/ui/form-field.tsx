import type { ReactNode } from "react";

interface FormFieldProps {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}

export function FormField({
  id,
  label,
  error,
  hint,
  required,
  children,
}: FormFieldProps) {
  const descriptionId = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
        {required ? <span className="ml-1 text-error">*</span> : null}
      </label>
      <div className="mt-2">{children}</div>
      {error ? (
        <p id={descriptionId} className="mt-1.5 text-sm text-error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={descriptionId} className="mt-1.5 text-sm text-text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
