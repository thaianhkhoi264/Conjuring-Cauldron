"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useRef } from "react";

import { floodScreen } from "@/components/water-transition";

/**
 * Wraps the login page and plays the "toss it into the cauldron" sequence when someone signs in:
 * the card squashes down, is tossed up and falls to the bottom, a green splash erupts where it lands,
 * then water rises over the whole screen and the next page appears as it fades.
 *
 * Built on the Web Animations API so each step can wait for the one before it. People who prefer
 * reduced motion get an immediate page change, and a click or key press skips the show.
 */

type Stage = { play: (href: string) => Promise<void> };

const StageContext = createContext<Stage | null>(null);

/** The stage around the login form, or null if the form is used somewhere else. */
export function useLoginStage() {
  return useContext(StageContext);
}

const DROPLETS = 30;
const THROW_MS = 1250;

const wait = (ms: number, wakers: (() => void)[]) =>
  new Promise<void>((resolve) => {
    const timer = window.setTimeout(resolve, ms);
    wakers.push(() => {
      window.clearTimeout(timer);
      resolve();
    });
  });

/** Green droplets thrown up from the point of impact, each following a gravity-like arc. */
function burst(layer: HTMLElement, x: number, animations: Animation[]) {
  layer.style.left = `${x}px`;
  const height = window.innerHeight;

  layer.querySelectorAll<HTMLElement>("[data-drop]").forEach((drop) => {
    const angle = (Math.random() - 0.5) * Math.PI * 0.95; // fan out to both sides
    const power = 0.45 + Math.random() * 0.55;
    const dx = Math.sin(angle) * (160 + power * 460);
    const rise = (0.3 + Math.random() * 0.7) * height * 0.55 * Math.cos(angle) + 70;
    const size = 6 + Math.pow(Math.random(), 1.6) * 20;
    const duration = 900 + Math.random() * 600;
    const delay = Math.random() * 70;
    drop.style.width = drop.style.height = `${size}px`;

    // Sideways at a steady speed; up fast then falling back, on the inner element, so the path is a parabola.
    animations.push(
      drop.animate([{ transform: "translateX(0)" }, { transform: `translateX(${dx}px)` }], { duration, delay, easing: "linear", fill: "forwards" }),
    );
    const blob = drop.firstElementChild as HTMLElement;
    animations.push(
      blob.animate(
        [
          { transform: "translateY(0) scale(1)", opacity: 1, easing: "cubic-bezier(0.2, 0.75, 0.45, 1)" },
          { offset: 0.45, transform: `translateY(${-rise}px) scale(1)`, opacity: 1, easing: "cubic-bezier(0.55, 0, 0.9, 0.6)" },
          { transform: "translateY(70px) scale(0.5)", opacity: 0 },
        ],
        { duration, delay, fill: "forwards" },
      ),
    );
  });

  const ring = layer.querySelector<HTMLElement>("[data-ring]");
  if (ring) {
    animations.push(
      ring.animate(
        [
          { transform: "scale(0.1)", opacity: 0.95 },
          { transform: "scale(1.15)", opacity: 0 },
        ],
        { duration: 800, easing: "cubic-bezier(0.1, 0.7, 0.3, 1)", fill: "forwards" },
      ),
    );
  }
}

export function LoginStage({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const playing = useRef(false);

  const play = useCallback(
    async (href: string) => {
      const go = () => {
        router.push(href);
        router.refresh();
      };
      const stage = root.current;
      const card = stage?.querySelector<HTMLElement>(".float-card");
      const layer = stage?.querySelector<HTMLElement>(".splash-layer");
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!stage || !card || !layer || reduceMotion || typeof card.animate !== "function" || playing.current) {
        go();
        return;
      }
      playing.current = true;

      const animations: Animation[] = [];
      const wakers: (() => void)[] = [];
      let skipped = false;
      const skip = (event: Event) => {
        if (event instanceof KeyboardEvent && event.repeat) return;
        skipped = true;
        animations.forEach((animation) => {
          try {
            animation.finish();
          } catch {
            /* already finished or cancelled */
          }
        });
        wakers.splice(0).forEach((wake) => wake());
      };
      window.addEventListener("pointerdown", skip);
      window.addEventListener("keydown", skip);

      try {
        // Start from exactly where the floating card is, so there is no jump.
        const rect = card.getBoundingClientRect();
        const computed = getComputedStyle(card).transform;
        const matrix = computed && computed !== "none" ? new DOMMatrixReadOnly(computed) : new DOMMatrixReadOnly();
        const sx = matrix.m41;
        const sy = matrix.m42;
        const sr = (Math.atan2(matrix.m12, matrix.m11) * 180) / Math.PI;
        const fall = window.innerHeight - rect.top + 30;
        const pose = (x: number, y: number, rotate: number, scale: string) =>
          `translate3d(${sx + x}px, ${sy + y}px, 0) rotate(${rotate}deg) scale(${scale})`;

        card.style.animation = "none";
        const toss = card.animate(
          [
            { offset: 0, transform: pose(0, 0, sr, "1"), opacity: 1, easing: "cubic-bezier(0.3, 0, 0.4, 1)" },
            { offset: 0.14, transform: pose(0, 18, sr, "1.03, 0.94"), easing: "cubic-bezier(0.15, 0.7, 0.3, 1)" }, // pressed down
            { offset: 0.38, transform: pose(14, -90, -4, "0.98, 1.02"), easing: "cubic-bezier(0.55, 0, 0.9, 0.5)" }, // top of the toss
            { offset: 0.94, transform: pose(70, fall, 16, "0.55"), opacity: 1 }, // falling, shrinking into the cauldron
            { offset: 1, transform: pose(70, fall, 18, "0.5"), opacity: 0 },
          ],
          { duration: THROW_MS, fill: "forwards" },
        );
        animations.push(toss);
        await toss.finished.catch(() => undefined);

        // Impact: splash, ripple, and a flash of the cauldron glow.
        burst(layer, rect.left + rect.width / 2 + 70, animations);
        stage
          .querySelector<HTMLElement>(".cauldron-glow")
          ?.animate(
            [{ filter: "brightness(1)" }, { offset: 0.2, filter: "brightness(2.4)" }, { filter: "brightness(1)" }],
            { duration: 950, easing: "ease-out" },
          );

        await wait(skipped ? 0 : 460, wakers);
        await floodScreen(skipped);
        go();
      } catch {
        go();
      } finally {
        window.removeEventListener("pointerdown", skip);
        window.removeEventListener("keydown", skip);
        playing.current = false;
        // If we are somehow still on the login page a while later, bring the card back.
        window.setTimeout(() => {
          if (root.current) {
            card.getAnimations().forEach((animation) => animation.cancel());
            card.style.animation = "";
          }
        }, 7000);
      }
    },
    [router],
  );

  const value = useMemo<Stage>(() => ({ play }), [play]);

  return (
    <StageContext.Provider value={value}>
      <div ref={root} className="relative min-h-screen overflow-hidden bg-[linear-gradient(to_bottom,#14101f_0%,#171428_55%,#0d2420_100%)]">
        {children}
        <div className="splash-layer" aria-hidden="true">
          <span className="splash-ring" data-ring />
          {Array.from({ length: DROPLETS }, (_, index) => (
            <span key={index} className="splash-drop" data-drop>
              <span className="splash-blob" />
            </span>
          ))}
        </div>
      </div>
    </StageContext.Provider>
  );
}
