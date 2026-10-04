import type { CSSProperties } from "react";

/**
 * Green potion bubbles rising from a glowing cauldron. Pure CSS animation (see globals.css), no images or
 * libraries, so it works offline and costs almost nothing. Purely decorative: hidden from screen readers and
 * never intercepts clicks. Users who prefer reduced motion get still bubbles instead.
 *
 * The bubbles come from a fixed seed, so the server and the browser always agree on them.
 */

function seededRandom(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Bubble = { x: number; size: number; duration: number; delay: number; drift: number; peak: number; rest: number };

const random = seededRandom(20261004);

const BUBBLES: Bubble[] = Array.from({ length: 30 }, () => ({
  x: Math.round(random() * 96 + 2), // percent from the left
  size: Math.round(8 + Math.pow(random(), 1.7) * 44), // mostly small, a few big
  duration: Math.round((9 + random() * 13) * 10) / 10, // seconds to cross the screen
  delay: -Math.round(random() * 22 * 10) / 10, // negative: the screen is already full when the page opens
  drift: Math.round((random() - 0.5) * 120), // sideways sway in px
  peak: Math.round((0.3 + random() * 0.5) * 100) / 100,
  rest: Math.round(random() * 70), // where a bubble sits when motion is reduced (percent from the bottom)
}));

export function BubbleBackground() {
  return (
    <div className="bubble-field" aria-hidden="true">
      <div className="cauldron-glow" />
      {BUBBLES.map((bubble, index) => (
        <span
          key={index}
          className="bubble"
          style={
            {
              "--x": `${bubble.x}%`,
              "--size": `${bubble.size}px`,
              "--duration": `${bubble.duration}s`,
              "--delay": `${bubble.delay}s`,
              "--drift": `${bubble.drift}px`,
              "--peak": bubble.peak,
              "--rest": `${bubble.rest}%`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
