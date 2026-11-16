import { NextResponse } from "next/server";
import { getApiErrorResponse, getCurrentUserContext } from "@/lib/pos/auth";
import {
  claimPaymentLinkReceipt,
  finishPaymentLinkReceipt,
} from "@/lib/pos/payment-link-receipts";

export async function POST(request, { params }) {
  try {
    const context = await getCurrentUserContext({ redirectToLogin: false });
    const { linkId } = await params;
    const claim = await claimPaymentLinkReceipt(
      context,
      linkId,
      await request.json().catch(() => ({})),
    );
    return NextResponse.json({ claim });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}

export async function PATCH(request, { params }) {
  try {
    const context = await getCurrentUserContext({ redirectToLogin: false });
    const { linkId } = await params;
    const receipt = await finishPaymentLinkReceipt(
      context,
      linkId,
      await request.json().catch(() => ({})),
    );
    return NextResponse.json({ receipt });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}
