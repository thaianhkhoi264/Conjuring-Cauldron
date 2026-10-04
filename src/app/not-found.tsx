import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 p-8 text-center">
      <div aria-hidden="true" className="empty-icon text-6xl">
        🫕
      </div>
      <h1 className="text-3xl font-bold">This page boiled away</h1>
      <p className="text-violet-200">We could not find what you were looking for. Maybe it was never in the cauldron.</p>
      <Link
        href="/"
        className="rounded-lg bg-gradient-to-b from-emerald-300 to-emerald-500 px-5 py-2.5 font-semibold text-emerald-950"
      >
        Back to the cafe
      </Link>
    </main>
  );
}
