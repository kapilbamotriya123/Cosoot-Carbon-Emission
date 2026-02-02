import Link from "next/link";

export default function DashboardPage() {
  return (
    <div className="min-h-screen p-8">
      <header className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Cosoot Dashboard</h1>
      </header>
      <main>
        <p className="text-gray-600 mb-6">
          Welcome to Cosoot.
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
          <Link
            href="/dashboard/upload-production"
            className="inline-block px-4 py-2 bg-zinc-900 text-white rounded-lg hover:bg-zinc-700 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Upload Production Data
          </Link>
        </div>
      </main>
    </div>
  );
}
