import { redirect } from "next/navigation";

export default function Home() {
  // No public landing page — send everyone to dashboard.
  // If not authenticated, middleware will redirect to /sign-in.
  redirect("/dashboard");
}
