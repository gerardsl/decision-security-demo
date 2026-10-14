import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { MockDataBanner } from "@/components/MockDataBanner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Decision-1 Security Demo",
  description: "Security decision demo backed by Microsoft Decision-1.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <MockDataBanner />
        {children}
      </body>
    </html>
  );
}
