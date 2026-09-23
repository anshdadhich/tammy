import { redirect } from "next/navigation";

// Legacy path: dossiers live at /talent/[id] now.
export default async function UserLegacy({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/talent/${id}`);
}
