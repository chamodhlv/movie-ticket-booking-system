import type { InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & { label: string };

// A labelled input. `...rest` passes through type, value, onChange, required, etc.
export default function TextField({ label, id, ...rest }: Props) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm text-slate-300">
        {label}
      </label>
      <input
        id={id}
        className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-emerald-500"
        {...rest}
      />
    </div>
  );
}
