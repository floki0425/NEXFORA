import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { serverEnv } from "@/config/env.server";

import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(serverEnv.NEXT_PUBLIC_APP_URL),
  title: "Nexfora",
  description: "Nexfora Digital Innovation.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
