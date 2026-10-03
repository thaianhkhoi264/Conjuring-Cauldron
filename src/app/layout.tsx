import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Conjuring Cauldron",
  description: "Train, evaluate and schedule food service employees with AI.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
