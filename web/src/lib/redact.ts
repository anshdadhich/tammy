const EMAIL_RE = /[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+/g;
const TEL_URI_RE = /tel:\+?[0-9][0-9\s\-().]{5,19}/gi;
const E164_RE = /\+[1-9]\d{7,14}(?!\d)/g;
const PHONE_LIKE_RE = /(?<!\d)(?:\+?\d[\s\-().]*){7,}(?!\d)/g;
const AADHAAR_SPACED_RE = /(?<!\d)\d{4}[ ]\d{4}[ ]\d{4}(?!\d)/g;
const AADHAAR_RUN_RE = /(?<!\d)\d{12}(?!\d)/g;

function maskPhonesSegment(s: string): string {
  let out = s.replace(TEL_URI_RE, "[redacted-phone]");
  out = out.replace(AADHAAR_SPACED_RE, "[redacted-id]");
  out = out.replace(EMAIL_RE, "[redacted-email]");
  out = out.replace(E164_RE, "[redacted-phone]");
  out = out.replace(AADHAAR_RUN_RE, (m, offset, full) => {
    const before = full.slice(Math.max(0, offset - 1), offset);
    const after = full.slice(offset + m.length, offset + m.length + 1);
    if (/[0-9]/.test(before) || /[0-9]/.test(after)) return m;
    return "[redacted-id]";
  });
  out = out.replace(PHONE_LIKE_RE, (m) => {
    const digits = m.replace(/\D/g, "");
    if (digits.length >= 10 && digits.length <= 15) {
      if (digits.length === 13) {
        const v = Number(digits);
        if (Number.isFinite(v) && v >= 1700000000000 && v <= 2100000000000) return m;
      }
      return "[redacted-phone]";
    }
    return m;
  });
  return out;
}

export function redactPii(s: string): string {
  if (!s) return s;
  return maskPhonesSegment(s);
}
