"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

/**
 * A full-screen wave of green water for page transitions. It lives in the root layout so it survives the
 * page change: the login page floods the screen, navigates while everything is covered, and the water fades
 * away once the new page has appeared. When nothing is playing it renders a hidden element and does nothing.
 */

type Controller = { flood: (quick: boolean) => Promise<void> };
let controller: Controller | null = null;

/** Raise the water until the screen is fully covered. Resolves at that moment (immediately if the overlay is missing). */
export function floodScreen(quick = false): Promise<void> {
  return controller ? controller.flood(quick) : Promise.resolve();
}

const RISE_MS = 1150;
const QUICK_RISE_MS = 350;
const FADE_MS = 450;
/** A beat for the new page to paint underneath before the water fades. */
const REVEAL_DELAY_MS = 60;
/** If the new page never appears, do not leave the screen covered. */
const GIVE_UP_MS = 6000;

export function WaterTransition() {
  const pathname = usePathname();
  const root = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const covered = useRef<{ from: string; timer: number } | null>(null);
  const currentPath = useRef(pathname);

  useEffect(() => {
    currentPath.current = pathname;
  }, [pathname]);

  const reveal = useCallback(async () => {
    const el = root.current;
    const state = covered.current;
    if (!el || !state) return;
    covered.current = null;
    window.clearTimeout(state.timer);
    await new Promise((resolve) => window.setTimeout(resolve, REVEAL_DELAY_MS)); // let the new page paint underneath
    const fade = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, easing: "ease-out", fill: "forwards" });
    await fade.finished.catch(() => undefined);
    el.style.display = "none";
    el.getAnimations().forEach((animation) => animation.cancel());
    body.current?.getAnimations().forEach((animation) => animation.cancel());
  }, []);

  const flood = useCallback(
    async (quick: boolean) => {
      const el = root.current;
      const water = body.current;
      if (!el || !water) return;
      el.getAnimations().forEach((animation) => animation.cancel());
      water.getAnimations().forEach((animation) => animation.cancel());
      el.style.display = "block";
      const travel = window.innerHeight + 140;
      const rise = water.animate([{ transform: "translateY(0)" }, { transform: `translateY(${-travel}px)` }], {
        duration: quick ? QUICK_RISE_MS : RISE_MS,
        easing: "cubic-bezier(0.45, 0.05, 0.3, 1)",
        fill: "forwards",
      });
      await rise.finished.catch(() => undefined);
      covered.current = { from: currentPath.current, timer: window.setTimeout(() => void reveal(), GIVE_UP_MS) };
    },
    [reveal],
  );

  useEffect(() => {
    const mine: Controller = { flood };
    controller = mine;
    return () => {
      if (controller === mine) controller = null;
    };
  }, [flood]);

  // The new page has appeared while the screen is covered: show it.
  useEffect(() => {
    if (covered.current && pathname !== covered.current.from) void reveal();
  }, [pathname, reveal]);

  return (
    <div ref={root} className="water-root" aria-hidden="true" style={{ display: "none" }}>
      <div ref={body} className="water-body">
        <div className="wave wave-back" />
        <div className="wave wave-mid" />
        <div className="wave wave-front" />
        <div className="water-fill" />
      </div>
    </div>
  );
}
