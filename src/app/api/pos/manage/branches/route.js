import { NextResponse } from "next/server";
import {
  assertCanManageCatalog,
  getApiErrorResponse,
  getCurrentUserContext,
} from "@/lib/pos/auth";
import { createBranch, listBranches } from "@/lib/pos/management";

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const context = await getCurrentUserContext({ redirectToLogin: false });
    assertCanManageCatalog(context);
    const branches = await listBranches(context, {
      search: url.searchParams.get("search") || "",
    });

    return NextResponse.json({ branches });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}

export async function POST(request) {
  try {
    const input = await request.json();
    const context = await getCurrentUserContext({ redirectToLogin: false });
    const branch = await createBranch(context, input);

    return NextResponse.json({ branch }, { status: 201 });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}
