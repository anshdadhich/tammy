import { redirect } from "next/navigation";

// /hire never renders: middleware forwards to /hire/search (hr session)
// or /hire/login (logged out) before this component runs.
export default function HireGateway() {
  redirect("/hire/search");
}
