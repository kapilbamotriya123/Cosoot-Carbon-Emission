import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher(["/sign-in(.*)", "/api/setup"]);

export default clerkMiddleware(async (auth, request) => {
  const url = request.nextUrl;

  // Allow public routes without auth
  if (isPublicRoute(request)) {
    return;
  }

  // Protect all other routes — redirect unauthenticated users to sign-in
  const { userId } = await auth.protect();

  // Fetch full user to get publicMetadata (not available in JWT sessionClaims by default)
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const metadata = user.publicMetadata as {
    role?: string;
    companySlug?: string;
  };
  const role = metadata?.role ?? "user";
  const userCompany = metadata?.companySlug || "meta_engitech_pune";

  // Redirect root "/" to dashboard
  if (url.pathname === "/") {
    url.pathname = "/dashboard";
    url.searchParams.set("company", userCompany);
    return NextResponse.redirect(url);
  }

  // Dashboard routes: inject default company if missing
  if (url.pathname.startsWith("/dashboard") && !url.searchParams.get("company")) {
    url.searchParams.set("company", userCompany);
    return NextResponse.redirect(url);
  }

  // Company enforcement: non-admin users can only access their assigned company
  if (role !== "admin" && url.pathname.startsWith("/dashboard")) {
    const requestedCompany = url.searchParams.get("company");
    if (requestedCompany && requestedCompany !== userCompany) {
      url.searchParams.set("company", userCompany);
      return NextResponse.redirect(url);
    }
  }

  // API company enforcement: non-admin users can only query their own company
  if (role !== "admin" && url.pathname.startsWith("/api/")) {
    const requestedCompany =
      url.searchParams.get("company") || url.searchParams.get("companySlug");
    if (requestedCompany && requestedCompany !== userCompany) {
      return NextResponse.json(
        { error: "Access denied: you can only access your assigned company" },
        { status: 403 }
      );
    }
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
