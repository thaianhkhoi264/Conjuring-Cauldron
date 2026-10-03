import type { ShiftSlot } from "@/lib/db/types";

/** Shift windows (24h clock). Shared by the seed, scheduler and UI. */
export const SLOT_TIMES: Record<ShiftSlot, { start: string; end: string }> = {
  open: { start: "07:00", end: "11:00" },
  mid: { start: "11:00", end: "15:00" },
  close: { start: "15:00", end: "19:00" },
};

export const SLOT_HOURS = 4;
