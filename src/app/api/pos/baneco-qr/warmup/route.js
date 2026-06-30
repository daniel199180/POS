import { NextResponse } from "next/server";
import { getApiErrorResponse, getCurrentUserContext } from "@/lib/pos/auth";

export async function POST(request) {
  try {
    const input = await request.json();
    await getCurrentUserContext({ redirectToLogin: false });

    return NextResponse.json({
      warmup: {
        branchId: input.branchId || "",
        paymentMethodId: input.paymentMethodId || "",
        status: "skipped",
        checkedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}
