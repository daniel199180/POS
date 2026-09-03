import { NextResponse } from "next/server";
import { getCurrentUserContext, getApiErrorResponse } from "@/lib/pos/auth";
import { getSalesAnalytics } from "@/lib/pos/analytics";

export async function GET(request) {
  try {
    const context = await getCurrentUserContext({ redirectToLogin: false });
    const report = await getSalesAnalytics(
      context,
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return NextResponse.json(report, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}
