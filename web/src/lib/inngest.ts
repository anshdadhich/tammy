import { Inngest } from "inngest";

export const inngest = new Inngest({ id: "reverse-hiring" });

// Event: candidate.profile.submitted { candidateId }
// Steps run in web/src/lib/profile-pipeline.ts (normalize -> summary -> depth -> chunks -> embed -> active).
// Uses Inngest step retries so Voyage/LLM timeouts don't lose profiles.
