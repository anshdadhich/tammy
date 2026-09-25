import AppNav from "@/components/AppNav";
import SiteFooter from "@/components/SiteFooter";

export default function PageShell({
  children,
  active,
  footer,
}: {
  children: React.ReactNode;
  active?: string;
  footer?: boolean;
}) {
  return (
    <div className="relative min-h-screen bg-paper text-body antialiased selection:bg-brand selection:text-on-brand">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <AppNav active={active} />
      <main id="main-content">{children}</main>
      {footer ? <SiteFooter /> : null}
    </div>
  );
}
