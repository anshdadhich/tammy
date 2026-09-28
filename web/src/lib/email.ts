import { Resend } from "resend";
import { redactPii } from "@/lib/redact";

export type SendEmailResult =
  | { skipped: true; reason: string }
  | { skipped: false; id?: string };

const STRICT_EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isValidEmail(v: string): boolean {
  const s = v.trim();
  if (!s || s.length > 254 || s.includes("\n") || s.includes("\r")) return false;
  return STRICT_EMAIL_RE.test(s);
}

function extractEmailAddress(from: string): string | null {
  const s = from.trim();
  const m = s.match(/<([^<>]+)>\s*$/);
  const addr = m ? m[1].trim() : s;
  if (!isValidEmail(addr)) return null;
  if (/[\r\n]/.test(s)) return null;
  return addr;
}

function sanitizeSubject(subject: string): string {
  return subject.replace(/[\r\n]+/g, " ").replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, 200);
}

function resolveSiteUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim();
  const fallback = "https://example.com";
  if (process.env.NODE_ENV === "production" && !raw) {
    console.warn("[email] NEXT_PUBLIC_SITE_URL unset in production — links fall back to example.com");
  }
  const candidate = raw || (process.env.NODE_ENV === "production" ? fallback : "http://localhost:3000");
  try {
    const u = new URL(candidate);
    if (u.protocol !== "https:" && u.protocol !== "http:") return fallback;
    if (process.env.NODE_ENV === "production" && u.protocol !== "https:") return fallback;
    if (process.env.NODE_ENV === "production" && /^(localhost|127\.|0\.0\.0\.0)/i.test(u.hostname)) return fallback;
    return u.origin;
  } catch {
    return process.env.NODE_ENV === "production" ? fallback : "http://localhost:3000";
  }
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
  const toAddr = String(to ?? "").trim();
  if (!isValidEmail(toAddr)) {
    console.warn("[email] invalid recipient — skipping send");
    return { skipped: true, reason: "invalid recipient" };
  }
  const safeSubject = sanitizeSubject(subject);
  if (!safeSubject) {
    return { skipped: true, reason: "empty subject" };
  }
  try {
    const resend = new Resend(apiKey);
    const rawFrom = (process.env.RESEND_FROM ?? "Reverse Hiring <onboarding@resend.dev>").trim();
    const fromAddr = extractEmailAddress(rawFrom);
    if (!fromAddr) {
      console.warn("[email] invalid sender — skipping send");
      return { skipped: true, reason: "invalid sender" };
    }
    const { data, error } = await resend.emails.send({
      from: rawFrom,
      to: toAddr,
      subject: safeSubject,
      html,
    });
    if (error) {
      console.error("[email] Resend error:", redactPii(error.message || "resend error"));
      return { skipped: true, reason: "resend error" };
    }
    return { skipped: false, id: data?.id };
  } catch (e) {
    const msg = (e as Error).message;
    console.error("[email] send failed:", redactPii(msg));
    return { skipped: true, reason: "send failed" };
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
  const site = resolveSiteUrl();
  const profilePath = candidateId ? `/talent/${encodeURIComponent(candidateId)}` : "/join";
  return {
    subject: sanitizeSubject("Your Reverse Hiring profile is live"),
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
    subject: sanitizeSubject(`You were shortlisted for ${String(jobTitle || "a role")}`),
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
    subject: sanitizeSubject("An employer reached out to you"),
    html: shell(
      `Hi ${safeName} — an employer contacted you 👋`,
      `<p>An employer reached out${suffix}.</p>`
        + `<p>They used the contact details on your profile. Check your email/phone for their message.</p>`,
    ),
  };
}
