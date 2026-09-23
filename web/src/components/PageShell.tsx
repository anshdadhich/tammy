import AppNav from "@/components/AppNav";
import SiteFooter from "@/components/SiteFooter";

/**
 * Every route wears the same chrome: skip link, nav, <main> landmark,
 * footer. Landing passes no `active`; employer routes pass "/hire".
 */
export default function PageShell({
  children,
  active,
}: {
  children: React.ReactNode;
  active?: string;
}) {
  return (
    <div className="relative min-h-screen bg-paper text-body antialiased selection:bg-brand selection:text-on-brand">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <AppNav active={active} />
      <main id="main-content">{children}</main>
      <SiteFooter />
    </div>
  );
}
