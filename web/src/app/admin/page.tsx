import PageShell from "@/components/PageShell";
import { AuthError, requireRole } from "@/lib/auth";
import { listAdminEmployers } from "@/lib/admin-employers";
import AdminEmployers from "./admin-employers";

export default async function AdminPage() {
  let allowed = false;
  let initialEmployers: Awaited<ReturnType<typeof listAdminEmployers>> = [];
  try {
    await requireRole("admin");
    allowed = true;
  } catch (e) {
    if (!(e instanceof AuthError)) throw e;
  }
  if (allowed) initialEmployers = await listAdminEmployers("pending", 100);
  return (
    <PageShell>
      <section className="pt-20 lg:pt-28 pb-24">
        <div className="max-w-[1160px] mx-auto px-6">
          <p className="meta-chip">Admin</p>
          <h1 className="text-[clamp(2rem,4.5vw,3.25rem)] font-semibold tracking-[-0.03em] leading-[1.06] text-ink mt-4">
            Employer verification
          </h1>
          <p className="text-[16px] text-body mt-2 max-w-[52ch]">
            Companies await approval here, oldest first. Verified employers unlock search.
          </p>
          <div className="mt-8">
            {allowed ? (
              <AdminEmployers initialRows={initialEmployers} />
            ) : (
              <p className="empty-note">
                Not authorized. Sign in with an admin account to review employers.
              </p>
            )}
          </div>
        </div>
      </section>
    </PageShell>
  );
}
