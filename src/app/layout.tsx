import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

export const metadata: Metadata = {
  title: "actions-twice — GitHub Actions running twice",
  description:
    "Find and fix GitHub Actions workflows that run twice on the same commit.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">{children}</div>
        <Analytics />
      </body>
    </html>
  );
}
