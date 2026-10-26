import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Coach Platform",
  description: "The business side of your coaching practice, handled.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-AU">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
