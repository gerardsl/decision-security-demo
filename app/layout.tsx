import type { Metadata } from "next";
import localFont from "next/font/local";
import { Atmosphere } from "@/components/Atmosphere";
import { MockDataBanner } from "@/components/MockDataBanner";
import "./globals.css";

const inter = localFont({
  src: [
    { path: "./fonts/inter-latin-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/inter-latin-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/inter-latin-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-inter",
  display: "swap",
  adjustFontFallback: "Arial",
  fallback: ["ui-sans-serif", "system-ui", "Segoe UI", "sans-serif"],
});

const sourceSerif = localFont({
  src: [{ path: "./fonts/source-serif-4-latin-300.woff2", weight: "300", style: "normal" }],
  variable: "--font-source-serif",
  display: "swap",
  adjustFontFallback: "Times New Roman",
  fallback: ["Iowan Old Style", "Palatino Linotype", "Palatino", "Times New Roman", "serif"],
});

export const metadata: Metadata = {
  title: "Decision-1 Security Demo",
  description: "Security decision demo backed by Microsoft Decision-1.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${sourceSerif.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Atmosphere />
        <div className="relative z-10 flex min-h-full flex-1 flex-col">
          <MockDataBanner />
          {children}
        </div>
      </body>
    </html>
  );
}
