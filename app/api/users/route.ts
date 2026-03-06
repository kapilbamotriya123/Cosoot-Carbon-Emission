import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { requireAuth } from "@/lib/auth";

// GET /api/users — list all users
export async function GET() {
  const authResult = await requireAuth();
  if (!authResult.authenticated) return authResult.response;

  try {
    const client = await clerkClient();
    const { data: users } = await client.users.getUserList({ limit: 100 });

    const mapped = users.map((u) => ({
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.emailAddresses[0]?.emailAddress ?? "",
      role: (u.publicMetadata as { role?: string })?.role ?? "user",
      companySlug:
        (u.publicMetadata as { companySlug?: string })?.companySlug ?? null,
      createdAt: u.createdAt,
    }));

    return NextResponse.json({ success: true, data: mapped });
  } catch (err) {
    console.error("Failed to list users:", err);
    return NextResponse.json(
      { error: "Failed to list users" },
      { status: 500 }
    );
  }
}

// POST /api/users — create a new user
export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!authResult.authenticated) return authResult.response;

  try {
    const body = await request.json();
    const { firstName, lastName, email, password, role, companySlug } = body;

    if (!email || !password || !role || !companySlug) {
      return NextResponse.json(
        { error: "email, password, role, and companySlug are required" },
        { status: 400 }
      );
    }

    const client = await clerkClient();
    const user = await client.users.createUser({
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      emailAddress: [email],
      password,
      publicMetadata: { role, companySlug },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.emailAddresses[0]?.emailAddress ?? email,
        role,
        companySlug,
      },
    });
  } catch (err: unknown) {
    console.error("Failed to create user:", JSON.stringify(err, null, 2));
    // Clerk errors have an `errors` array with detailed messages
    const clerkErr = err as { errors?: { message?: string; longMessage?: string; code?: string }[] };
    const detail = clerkErr.errors?.[0]?.longMessage || clerkErr.errors?.[0]?.message;
    const message = detail || (err instanceof Error ? err.message : "Failed to create user");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PATCH /api/users — update a user's metadata
export async function PATCH(request: NextRequest) {
  const authResult = await requireAuth();
  if (!authResult.authenticated) return authResult.response;

  try {
    const body = await request.json();
    const { userId, role, companySlug } = body;

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    const client = await clerkClient();
    await client.users.updateUserMetadata(userId, {
      publicMetadata: {
        ...(role !== undefined && { role }),
        ...(companySlug !== undefined && { companySlug }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("Failed to update user:", err);
    const message =
      err instanceof Error ? err.message : "Failed to update user";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/users — delete a user
export async function DELETE(request: NextRequest) {
  const authResult = await requireAuth();
  if (!authResult.authenticated) return authResult.response;

  try {
    const { searchParams } = request.nextUrl;
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    const client = await clerkClient();
    await client.users.deleteUser(userId);

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("Failed to delete user:", err);
    const message =
      err instanceof Error ? err.message : "Failed to delete user";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
