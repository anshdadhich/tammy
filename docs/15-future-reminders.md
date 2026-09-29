# Future reminders (parked, not active)

## 1. Cloudflare Turnstile (bot protection for public signup)
What: free "I'm not a robot" checkbox, lighter than reCAPTCHA, no Google tracking.
How it works, two halves:
- Browser half: the widget gives the browser a token string on submit. The join
  wizard must send it as `captchaToken` / `turnstileToken` / `cf-turnstile-response`
  in the publish request body.
- Server half: the API sends that token to Cloudflare's `siteverify` endpoint with
  a secret key; Cloudflare answers yes/no. Bots cannot fake this because they
  cannot get a real token.
Current state: `verifyCaptchaHook` in `web/src/app/api/candidates/route.ts` only
checks that a token-looking string arrived, and only when `TURNSTILE_REQUIRED=1`
(or `CAPTCHA_REQUIRED=1`). There is no browser widget yet and no server-side
`siteverify` call - turning the flag on today only rejects signups that send no
token. Parked because honeypot + rate limits are enough until bot signups appear.
When ready (needs Cloudflare site key + secret key in env):
1. Cloudflare dashboard -> Turnstile -> create site -> copy site key (public) and
   secret key (private, env only).
2. Add the widget to `web/src/app/join/join-wizard.tsx`, send the token in publish.
3. Add the real `siteverify` POST inside `verifyCaptchaHook`.
4. Set `TURNSTILE_REQUIRED=1`.

## 2. Project-depth calibration set (anchor the AI judge)
What: the judge scores each project shallow-to-deep with nothing anchoring what
"deep" means, so scores can drift whenever the prompt or model changes. A
calibration set is a small fixed list, written once, run whenever the prompt or
model changes. It does NOT freeze production judging - judging stays dynamic
per search; the set is an offline ruler.
Template (write 4-6 real examples, run judge, record expected bands):
- Tutorial to-do app, never deployed -> expect LOW.
- Deployed CRUD app with auth -> expect MEDIUM.
- Production app with payments, caching, real users -> expect HIGH.
- Distributed system with scale numbers and incident history -> expect VERY HIGH.
If the tutorial ever scores HIGH, the prompt is broken - caught before employers
see surprising scores. Takes ~30 minutes, lives in `docs/`, no code. Not started.

## 3. Deep-mode budget (parked by explicit decision)
Throttle exists (`search-deep` 10/10min per route). No monthly token alert, no
per-employer deep quota. Revisit only if deep-search usage or OpenRouter bills
grow. Do NOT implement until then.
