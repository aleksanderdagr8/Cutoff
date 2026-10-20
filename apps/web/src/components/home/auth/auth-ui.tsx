"use client";

const fieldClass =
  "mt-2 w-full border-b border-hairline bg-transparent py-2 text-[17px] text-ink outline-none transition-[border-color] duration-[160ms] ease-out focus:border-accent focus-visible:border-accent";

const buttonClass =
  "home-cta rounded-control bg-accent px-5 py-2.5 text-[15px] font-medium disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

type FieldProps = {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  describedBy?: string;
  invalid?: boolean;
  minLength?: number;
  required?: boolean;
  inputMode?: "numeric" | "email" | "text";
  maxLength?: number;
  pattern?: string;
  spellCheck?: boolean;
  autoFocus?: boolean;
  name?: string;
  className?: string;
};

export function AuthField({
  id,
  label,
  type = "text",
  value,
  onChange,
  autoComplete,
  describedBy,
  invalid,
  minLength,
  required,
  inputMode,
  maxLength,
  pattern,
  spellCheck,
  autoFocus,
  name,
  className,
}: FieldProps) {
  return (
    <label className="block" htmlFor={id}>
      <span className="text-[13px] text-secondary">{label}</span>
      <input
        id={id}
        name={name ?? id}
        type={type}
        required={required}
        minLength={minLength}
        maxLength={maxLength}
        pattern={pattern}
        inputMode={inputMode}
        spellCheck={spellCheck}
        autoFocus={autoFocus}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={className ? `${fieldClass} ${className}` : fieldClass}
      />
    </label>
  );
}

export function AuthError({ id, message }: { id: string; message: string | null }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="auth-error text-[14px]">
      {message}
    </p>
  );
}

export function AuthNotice({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="status" className="text-[14px] text-secondary">
      {message}
    </p>
  );
}

export function AuthSubmit({
  pending,
  pendingLabel,
  label,
  disabled,
}: {
  pending: boolean;
  pendingLabel: string;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending}
      className={buttonClass}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

export function AuthTextButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="text-[14px] font-medium text-accent underline-offset-4 hover:underline disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {children}
    </button>
  );
}
