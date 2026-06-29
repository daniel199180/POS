import { NextResponse } from "next/server";
import { getApiErrorResponse, getCurrentUserContext } from "@/lib/pos/auth";
import { createManagedUser, listManagedUsers } from "@/lib/pos/users";

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const context = await getCurrentUserContext({ redirectToLogin: false });
    const users = await listManagedUsers(context, {
      search: url.searchParams.get("search") || "",
    });

    return NextResponse.json({ users });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}

export async function POST(request) {
  try {
    const input = await request.json();
    const context = await getCurrentUserContext({ redirectToLogin: false });
    const user = await createManagedUser(context, input);

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}
