import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StreamScout · Find where to watch",
  description: "Search streaming services and compare included, free, rental, and purchase options.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
