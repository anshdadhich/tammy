import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";
import { functions } from "@/lib/profile-pipeline";

// Webhook endpoint for Inngest Cloud: point it at /api/webhooks/inngest.
export const { GET, POST, PUT } = serve({ client: inngest, functions });
