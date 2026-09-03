import { NextResponse } from "next/server";
import { getApiErrorResponse, getCurrentUserContext } from "@/lib/pos/auth";
import { cancelPaymentLink } from "@/lib/pos/payment-links";

export async function DELETE(_request, { params }) {
  try {
    const context = await getCurrentUserContext({ redirectToLogin: false });
    const { linkId } = await params;
    const link = await cancelPaymentLink(context, linkId);
    return NextResponse.json({ link });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}
