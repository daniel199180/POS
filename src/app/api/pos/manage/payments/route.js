import { NextResponse } from "next/server";
import {
  assertCanManagePayments,
  getApiErrorResponse,
  getCurrentUserContext,
} from "@/lib/pos/auth";
import { listPaymentSettings } from "@/lib/pos/payments";

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const context = await getCurrentUserContext({ redirectToLogin: false });
    assertCanManagePayments(context);
    const payload = await listPaymentSettings(context, {
      branchId: url.searchParams.get("branchId") || "",
    });

    return NextResponse.json(payload);
  } catch (error) {
    return getApiErrorResponse(error);
  }
}
