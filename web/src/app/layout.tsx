import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Tammy — Reverse Hiring Platform",
    template: "%s · Tammy",
  },
  description:
    "Candidates build one evidence-backed profile. Employers discover talent with semantic search, transparent scoring, and audit-logged outreach.",
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName: "Tammy",
    title: "Tammy — Reverse Hiring Platform",
    description:
      "Get discovered, hire fast. Evidence-backed profiles, semantic search, and accountable outreach.",
  },
  twitter: { card: "summary_large_image" },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable}`}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("tammy_theme");var d=t==="dark"||(t===null&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.setAttribute("data-theme",d?"dark":"light")}catch(e){}})()`,
          }}
        />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
