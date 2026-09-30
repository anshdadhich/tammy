import AppNav from "@/components/AppNav";
import SiteFooter from "@/components/SiteFooter";
import { readNavViewer } from "@/lib/hr-session";

export default async function PageShell({
  children,
  active,
  footer,
}: {
  children: React.ReactNode;
  active?: string;
  footer?: boolean;
}) {
  const { viewer: initialViewer, confirmed: viewerConfirmed } = await readNavViewer();
  return (
    <div className="relative min-h-screen bg-paper text-body antialiased selection:bg-brand selection:text-on-brand">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <AppNav active={active} initialViewer={initialViewer} viewerConfirmed={viewerConfirmed} />
      <main id="main-content">{children}</main>
      {footer ? <SiteFooter /> : null}
    </div>
  );
}
