"use client";

import type { ChangeEvent } from "react";

type TextInputProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  maxLength?: number;
  type?: "text" | "password" | "email";
};

export function TextInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  error,
  maxLength,
  type = "text",
}: TextInputProps) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-xs font-semibold uppercase tracking-[0.4em] text-white/70">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className="w-full rounded-xl border border-white/12 bg-white/10 px-4 py-3 text-sm font-medium uppercase tracking-[0.2em] text-white outline-none transition focus:border-fuchsia-400/70 focus:ring-2 focus:ring-fuchsia-400/30"
      />
      {error && (
        <p id={`${id}-error`} className="text-xs text-rose-300">
          {error}
        </p>
      )}
    </div>
  );
}
