import type {
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { inputClass } from "./styles";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  children: ReactNode; // the <option> elements
};

export function SelectField({ label, id, children, ...rest }: SelectProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm text-slate-300">
        {label}
      </label>
      <select id={id} className={inputClass} {...rest}>
        {children}
      </select>
    </div>
  );
}

type AreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
};

export function TextAreaField({ label, id, ...rest }: AreaProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm text-slate-300">
        {label}
      </label>
      <textarea id={id} rows={4} className={inputClass} {...rest} />
    </div>
  );
}

// Shows a server or validation error. `role="alert"` makes screen readers announce it.
export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-lg border border-red-800 bg-red-950 px-3 py-2 text-sm text-red-300"
    >
      {message}
    </p>
  );
}
