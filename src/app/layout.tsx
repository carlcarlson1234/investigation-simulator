import type { Metadata } from "next";
import { Bebas_Neue, JetBrains_Mono, DM_Sans, Inter } from "next/font/google";
import { SiteNav } from "@/components/site-nav";
import "./globals.css";

const bebasNeue = Bebas_Neue({
  weight: "400",
  variable: "--font-display",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

const dmSans = DM_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-brand",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

export const metadata: Metadata = {
  title: "OpenCase — Investigate Epstein",
  description:
    "Search, analyze, and connect evidence from the Epstein archive. Build your investigation board.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${bebasNeue.variable} ${jetbrainsMono.variable} ${dmSans.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground font-[family-name:var(--font-body)]">
        <SiteNav />
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
