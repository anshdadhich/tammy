import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";
import { functions } from "@/lib/profile-pipeline";

const signingKey = process.env.INNGEST_SIGNING_KEY;
const eventKey = process.env.INNGEST_EVENT_KEY;
const configured = Boolean(signingKey && eventKey);

if (!configured) {
  console.error("[inngest] webhook disabled: INNGEST_SIGNING_KEY or INNGEST_EVENT_KEY missing");
}

const live = configured ? serve({ client: inngest, functions }) : null;

async function disabled(): Promise<Response> {
  return Response.json({ error: "webhook not configured" }, { status: 500 });
}

export const GET = live ? live.GET : disabled;
export const POST = live ? live.POST : disabled;
export const PUT = live ? live.PUT : disabled;
