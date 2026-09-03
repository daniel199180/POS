import { NextResponse } from "next/server";
import {
  assertCanManageUsers,
  getApiErrorResponse,
  getCurrentUserContext,
} from "@/lib/pos/auth";
import {
  createManagedUser,
  getUserManagementCapabilities,
  listManagedUsers,
} from "@/lib/pos/users";

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const context = await getCurrentUserContext({ redirectToLogin: false });
    assertCanManageUsers(context);
    const [users, capabilities] = await Promise.all([
      listManagedUsers(context, {
        search: url.searchParams.get("search") || "",
      }),
      getUserManagementCapabilities(context),
    ]);

    return NextResponse.json({ users, capabilities });
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
