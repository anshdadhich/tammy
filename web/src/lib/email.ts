import { Resend } from "resend";
import { redactPii } from "@/lib/redact";

export type SendEmailResult =
  | { skipped: true; reason: string }
  | { skipped: false; id?: string };

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY missing — skipping send");
    return { skipped: true, reason: "RESEND_API_KEY missing" };
  }
  if (!to || !to.includes("@")) {
    console.warn("[email] invalid recipient — skipping send");
    return { skipped: true, reason: "invalid recipient" };
  }
  const safeSubject = subject.replace(/[\r\n]+/g, " ").slice(0, 200);
  if (!safeSubject.trim()) {
    return { skipped: true, reason: "empty subject" };
  }
  try {
    const resend = new Resend(apiKey);
    const from =
      process.env.RESEND_FROM ?? "Reverse Hiring <onboarding@resend.dev>";
    const { data, error } = await resend.emails.send({
      from,
      to,
      subject: safeSubject,
      html,
    });
    if (error) {
      console.error("[email] Resend error:", redactPii(error.message || "resend error"));
      return { skipped: true, reason: error.message || "resend error" };
    }
    return { skipped: false, id: data?.id };
  } catch (e) {
    const msg = (e as Error).message;
    console.error("[email] send failed:", redactPii(msg));
    return { skipped: true, reason: msg };
  }
}

function shell(title: string, body: string): string {
  return `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#18181b">`
    + `<h2 style="font-size:20px;margin:0 0 12px">${title}</h2>`
    + body
    + `<hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0" />`
    + `<p style="font-size:12px;color:#71717a">Reverse Hiring — you received this because you have a profile with us. Reply to opt out.</p>`
    + `</div>`;
}

export function profileReadyEmail(name: string, candidateId?: string): {
  subject: string;
  html: string;
} {
  const safe = escapeHtml(name || "there");
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const profilePath = candidateId ? `/talent/${encodeURIComponent(candidateId)}` : "/join";
  return {
    subject: "Your Reverse Hiring profile is live",
    html: shell(
      `Hi ${safe}, your profile is ready 🎉`,
      `<p>Your deep profile is now visible to verified employers. You don't need to apply anywhere — employers search the talent database and contact you directly (email/phone shown on match, open-contact model).</p>`
        + `<p>Tip: keep achievements and project evidence specific — that's what ranks you higher.</p>`
        + `<p><a href="${site}${profilePath}">View / update your profile</a></p>`,
    ),
  };
}

export function newMatchEmail(
  candidateName: string,
  jobTitle: string,
  company?: string | null,
): { subject: string; html: string } {
  const safeName = escapeHtml(candidateName || "there");
  const safeJob = escapeHtml(jobTitle || "a role");
  const safeCompany = company ? ` at ${escapeHtml(company)}` : "";
  return {
    subject: `You were shortlisted for ${jobTitle}`,
    html: shell(
      `Hi ${safeName} — an employer shortlisted you 🎯`,
      `<p>You were shortlisted for <strong>${safeJob}</strong>${safeCompany}.</p>`
        + `<p>The employer can see your full profile and contact details. Expect to hear from them directly — no cover letter needed.</p>`,
    ),
  };
}

export function contactLoggedEmail(
  candidateName: string,
  context: { jobTitle?: string | null; company?: string | null; channel?: string | null },
): { subject: string; html: string } {
  const safeName = escapeHtml(candidateName || "there");
  const bits: string[] = [];
  if (context.company) bits.push(`from ${escapeHtml(context.company)}`);
  if (context.jobTitle) bits.push(`about “${escapeHtml(context.jobTitle)}”`);
  if (context.channel) bits.push(`via ${escapeHtml(context.channel)}`);
  const suffix = bits.length ? ` ${bits.join(" ")}` : "";
  return {
    subject: "An employer reached out to you",
    html: shell(
      `Hi ${safeName} — an employer contacted you 👋`,
      `<p>An employer reached out${suffix}.</p>`
        + `<p>They used the contact details on your profile. Check your email/phone for their message.</p>`,
    ),
  };
}
