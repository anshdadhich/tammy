import { redirect } from "next/navigation";

// Legacy path: /hire/dash is now /hire/dashboard.
export default function DashLegacy() {
  redirect("/hire/dashboard");
}
