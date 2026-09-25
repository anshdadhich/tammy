import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";
import { functions } from "@/lib/profile-pipeline";

export const { GET, POST, PUT } = serve({ client: inngest, functions });
