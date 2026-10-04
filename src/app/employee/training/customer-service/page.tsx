import Link from "next/link";

import { requireEmployee } from "@/lib/require-user";
import { getMastery } from "@/lib/training/data";
import { CustomerServiceTraining } from "@/voice/customer-service-training";

export const dynamic = "force-dynamic";

export default async function CustomerServiceTrainingPage() {
  const user = await requireEmployee();
  const mastery = getMastery(user.id);

  return (
    <main className="mx-auto min-h-screen max-w-3xl p-8">
      <Link href="/employee/training" className="text-sm text-violet-300">← All training chapters</Link>
      <h1 className="mt-3 text-3xl font-bold">Customer Service training</h1>
      <CustomerServiceTraining initialScore={mastery.cs?.score ?? null} />
    </main>
  );
}
