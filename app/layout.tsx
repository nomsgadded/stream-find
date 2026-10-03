import type { Metadata } from "next";
import ReviewMode from "@/components/ReviewMode";
import ScrollMotion from "@/components/ScrollMotion";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stream Find · Find where to watch",
  description: "Search streaming services and compare included, free, rental, and purchase options.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Stream Find",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}<ScrollMotion /><ReviewMode /></body>
    </html>
  );
}
