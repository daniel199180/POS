import { NextResponse } from "next/server";
import { getCurrentUserContext, getApiErrorResponse } from "@/lib/pos/auth";
import { listAuditHistory } from "@/lib/pos/audit";

export async function GET(request) {
  try {
    const context = await getCurrentUserContext({ redirectToLogin: false });
    const result = await listAuditHistory(
      context,
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}
