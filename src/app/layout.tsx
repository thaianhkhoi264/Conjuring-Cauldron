import type { Metadata } from "next";
import "./globals.css";
import { AmbientBackground } from "@/components/ambient-background";
import { BubbleBackground } from "@/components/bubble-background";
import { WaterTransition } from "@/components/water-transition";

export const metadata: Metadata = {
  title: "Conjuring Cauldron",
  description: "Train, evaluate and schedule food service employees with AI.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AmbientBackground>
          <BubbleBackground />
        </AmbientBackground>
        {children}
        <WaterTransition />
      </body>
    </html>
  );
}
