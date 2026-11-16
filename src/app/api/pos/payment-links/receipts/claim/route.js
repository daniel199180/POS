import { NextResponse } from "next/server";
import { getApiErrorResponse, getCurrentUserContext } from "@/lib/pos/auth";
import { claimNextPaymentLinkReceipt } from "@/lib/pos/payment-link-receipts";

export async function POST(request) {
  try {
    const context = await getCurrentUserContext({ redirectToLogin: false });
    const claim = await claimNextPaymentLinkReceipt(
      context,
      await request.json().catch(() => ({})),
    );
    return NextResponse.json({ claim });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}
