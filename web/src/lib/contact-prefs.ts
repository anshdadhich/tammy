// Central contact-visibility filter. Candidate picks channels; HR sees only selected.
// Owner views (dashboard) bypass this and show everything with hidden flags.
export type ContactPrefs = {
  show_email?: boolean | null; show_phone?: boolean | null;
  show_linkedin?: boolean | null; show_github?: boolean | null;
  show_portfolio?: boolean | null; show_resume?: boolean | null;
  show_photo?: boolean | null;
  contact_email?: unknown; contact_phone?: unknown;
  linkedin_url?: unknown; github_url?: unknown;
  portfolio_url?: unknown; resume_url?: unknown; photo_url?: unknown;
};

export function applyContactPrefs<T extends ContactPrefs>(c: T): T {
  const out = { ...c };
  if (c.show_email === false) { out.contact_email = null; }
  if (c.show_phone === false) { out.contact_phone = null; }
  if (c.show_linkedin === false) { out.linkedin_url = null; }
  if (c.show_github === false) { out.github_url = null; }
  if (c.show_portfolio === false) { out.portfolio_url = null; }
  if (c.show_resume === false) { out.resume_url = null; }
  if (c.show_photo === false) { out.photo_url = null; }
  return out;
}
