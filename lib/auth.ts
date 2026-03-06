import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

type AuthSuccess = { authenticated: true; userId: string };
type AuthFailure = { authenticated: false; response: NextResponse };

export async function requireAuth(): Promise<AuthSuccess | AuthFailure> {
  const { userId } = await auth();
  if (!userId) {
    return {
      authenticated: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { authenticated: true, userId };
}
