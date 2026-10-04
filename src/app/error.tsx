"use client";

import Link from "next/link";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 p-8 text-center">
      <div aria-hidden="true" className="empty-icon text-6xl">
        💥
      </div>
      <h1 className="text-3xl font-bold">The potion bubbled over</h1>
      <p className="text-violet-200">Something went wrong on our side. Try again, and if it keeps happening, go back to the start.</p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-gradient-to-b from-emerald-300 to-emerald-500 px-5 py-2.5 font-semibold text-emerald-950"
        >
          Try again
        </button>
        <Link href="/" className="rounded-lg border border-violet-400/50 px-5 py-2.5">
          Back to the start
        </Link>
      </div>
    </main>
  );
}
