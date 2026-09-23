import AppNav from "@/components/AppNav";

// Shared across /hire, /hire/login and /hire/dashboard so the navbar mounts once
// and client-side transitions don't replay its entrance animation.
export default function HireLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppNav />
      {children}
    </>
  );
}
