import { NextResponse } from "next/server";
import { getApiErrorResponse, getCurrentUserContext } from "@/lib/pos/auth";
import { updatePaymentSetting } from "@/lib/pos/payments";

export async function PATCH(request, { params }) {
  try {
    const { methodId } = await params;
    const input = await request.json();
    const context = await getCurrentUserContext({ redirectToLogin: false });
    const method = await updatePaymentSetting(context, methodId, input);

    return NextResponse.json({ method });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}
