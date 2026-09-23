import { redirect } from "next/navigation";

// Legacy path: /start is now /join. Nothing deployed yet, but keep the shim
// for bookmarks and in-flight links.
export default function StartLegacy() {
  redirect("/join");
}
