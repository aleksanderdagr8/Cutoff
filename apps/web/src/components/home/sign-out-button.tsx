"use client";

export function SignOutButton() {
  return (
    <button
      type="button"
      className="text-[13px] text-secondary underline-offset-2 transition-colors duration-160 ease-out hover:text-ink hover:underline"
      onClick={async () => {
        await fetch("/api/home/session", { method: "DELETE" });
        window.location.href = "/home/sign-in";
      }}
    >
      Sign out
    </button>
  );
}
