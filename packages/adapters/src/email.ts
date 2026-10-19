/**
 * Unit 21 — household email notify for reorder.due (Resend/Postmark later).
 * Links go to /home/list only — no one-click money-moving tokens.
 */

export type ReorderDueEmailInput = {
  householdId: string;
  lineId: string;
  displayName: string | null;
  dueAt: string;
};

export type EmailNotifyResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

export interface EmailNotifyAdapter {
  sendReorderDue(input: ReorderDueEmailInput): Promise<EmailNotifyResult>;
}

/** In-memory / CI double. */
export class FakeEmailNotifyAdapter implements EmailNotifyAdapter {
  readonly sent: ReorderDueEmailInput[] = [];
  failNext = false;

  async sendReorderDue(
    input: ReorderDueEmailInput,
  ): Promise<EmailNotifyResult> {
    if (this.failNext) {
      this.failNext = false;
      return { ok: false, error: "email_adapter_error" };
    }
    this.sent.push(input);
    return { ok: true, messageId: `email_${this.sent.length}` };
  }
}

/** Plain-text body for agents/tests (no HTML). */
export function reorderDueEmailText(input: ReorderDueEmailInput): string {
  const name = input.displayName?.trim() || "An item";
  const day = input.dueAt.slice(0, 10);
  return `${name} is due ${day}. Ask your assistant to reorder, or skip/snooze at callcutoff.com/home/list.`;
}
