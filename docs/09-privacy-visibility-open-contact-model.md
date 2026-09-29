# 09 - Privacy & Visibility (Open-Contact Model)

> Your instruction applied: **DO NOT hide contact info until approval/unlock.** This doc replaces all hidden-gate versions.

## Rules now
- Candidates cannot browse each other. No public directory, no public URLs.
- Only verified/approved employers can search. Must have job intent. Rate-limited, anti-scrape.
- Employers see ONLY matched results per search, not full DB dump.
- On match: full profile visible immediately - name, headline, summary, skills, experience, projects, education, salary/availability, photo (if provided), email, phone, links.
- No anonymized stage, no request-to-reveal, no candidate accept-to-share.
- `contact_log` replaces approval table: log who viewed/contacted whom when.
- `audit_logs`: every view/shortlist/contact/export logged.

## Candidate controls (still present)
- visibility toggle: visible / hidden / inactive
- edit/delete/export data, withdraw consent
- freshness: inactive long → downranked / ask to update

## Employer controls
- register with company email, website, LinkedIn, size, purpose → manual approve early
- flag abuse: mass jobs no contact, scraping, downloading → block
- must provide real job to search

## Data protection
- collect only needed, clear consent, delete/export allowed, retention defined, encrypt sensitive, restrict access
- avoid sensitive attributes (religion, politics, health) unless legally needed
- no scraping people in without consent

## Photo note (open model)
Original warning: photos cause gender/age/appearance bias; hide early. In open model you chose speed over that protection - photo visible immediately if candidate uploads. Mitigation: make photo optional, tell candidates it's directly visible, keep evaluation evidence-first in UI (skills/projects above photo/contact).

## Why open
Per your "HR can just get candidates fastly" - zero wait, direct outreach. Trade-off accepted: higher spam/exposure vs speed.
