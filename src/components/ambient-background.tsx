"use client";

import { usePathname } from "next/navigation";
import type { CSSProperties } from "react";

/**
 * The quiet version of the login scenery for every page after sign-in: a few faint bubbles (passed in as
 * children, from the server), twinkling stars up high, and a shallow tide of green water along the bottom
 * that rises into place when the page first appears (so the login flood seems to settle instead of vanishing).
 *
 * It sits behind everything (z-index -1) and ignores the pointer, so it never gets in the way. The login
 * page has its own, livelier scenery, so nothing is drawn there.
 */

const STARS = Array.from({ length: 26 }, (_, index) => {
  // Deterministic scatter (no Math.random) so the server and the browser agree.
  const a = Math.sin(index * 12.9898) * 43758.5453;
  const b = Math.sin(index * 78.233) * 24634.6345;
  const c = Math.sin(index * 39.346) * 11927.1131;
  const frac = (n: number) => n - Math.floor(n);
  return {
    x: Math.round(frac(a) * 98 + 1),
    y: Math.round(frac(b) * 55 + 2),
    size: 2 + Math.round(frac(c) * 2),
    delay: -Math.round(frac(a + b) * 60) / 10,
    duration: 3.5 + Math.round(frac(b + c) * 40) / 10,
  };
});

export function AmbientBackground({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/login") return null;

  return (
    <div className="ambient" aria-hidden="true">
      {STARS.map((star, index) => (
        <span
          key={index}
          className="ambient-star"
          style={
            {
              left: `${star.x}%`,
              top: `${star.y}%`,
              width: star.size,
              height: star.size,
              animationDelay: `${star.delay}s`,
              animationDuration: `${star.duration}s`,
            } as CSSProperties
          }
        />
      ))}
      {children}
      <div className="ambient-water">
        <div className="ambient-tide">
          <div className="wave wave-back" />
          <div className="wave wave-mid" />
          <div className="wave wave-front" />
          <div className="water-fill" />
        </div>
      </div>
    </div>
  );
}
