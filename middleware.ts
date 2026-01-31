import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Define which routes DON'T require authentication
// Everything else is protected by default
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/api/emissions/(.*)", // TODO: remove after testing — temporarily public for Postman
]);

export default clerkMiddleware(async (auth, request) => {
  // If the route is not public, require authentication
  // This redirects unauthenticated users to the sign-in page
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  // This matcher tells Next.js which routes to run middleware on.
  // It runs on everything EXCEPT static files and Next.js internals.
  // Without this, middleware would also run on image/font/css requests — wasteful.
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
