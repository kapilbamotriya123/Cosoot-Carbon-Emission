import { UserButton } from "@clerk/nextjs";
import { currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const user = await currentUser();

  // This shouldn't happen because middleware protects this route,
  // but it's a safety net (defense in depth)
  if (!user) {
    redirect("/sign-in");
  }

  return (
    <div className="min-h-screen p-8">
      <header className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Cosoot Dashboard</h1>
        <UserButton />
      </header>
      <main>
        <p className="text-gray-600 mb-6">
          Welcome, {user.firstName ?? user.emailAddresses[0]?.emailAddress}.
        </p>
        <div className="flex gap-4">
          <Link
            href="/dashboard/upload-routing"
            className="inline-block px-4 py-2 bg-zinc-900 text-white rounded-lg hover:bg-zinc-700 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Upload BOM / Routing Data
          </Link>
          <Link
            href="/dashboard/upload-consumption"
            className="inline-block px-4 py-2 bg-zinc-900 text-white rounded-lg hover:bg-zinc-700 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Upload Consumption Data
          </Link>
        </div>
      </main>
    </div>
  );
}
