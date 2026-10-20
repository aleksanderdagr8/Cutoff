"use client";

export async function postAuth(
  url: string,
  body: unknown,
): Promise<{
  ok: boolean;
  status: number;
  message: string | null;
  step: string | null;
}> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = (await res.json().catch(() => null)) as {
    message?: string;
    step?: string;
  } | null;
  return {
    ok: res.ok,
    status: res.status,
    message: parsed?.message ?? null,
    step: parsed?.step ?? null,
  };
}
