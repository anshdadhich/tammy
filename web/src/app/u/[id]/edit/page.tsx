import { redirect } from "next/navigation";

// Legacy path: dossier edit lives at /talent/[id]/edit now.
export default async function UserEditLegacy({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/talent/${id}/edit`);
}
