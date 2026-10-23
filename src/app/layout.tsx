import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BeKnown Check: what does AI say about your café?",
  description:
    "Enter your café or juice bar and see what an AI assistant says about it, what looks wrong or missing, and paste-ready fixes.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
