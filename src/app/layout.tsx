import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Clinic CRM", template: "%s · Clinic CRM" },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
