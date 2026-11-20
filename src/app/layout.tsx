import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CosaMangio",
  description: "Il piano alimentare di ogni giorno: ricette, passaggi, spesa e allenamento",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "CosaMangio", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f1ea" },
    { media: "(prefers-color-scheme: dark)", color: "#111311" },
  ],
  colorScheme: "light dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it" className="h-full antialiased">
      <body className="flex min-h-dvh flex-col">{children}</body>
    </html>
  );
}
