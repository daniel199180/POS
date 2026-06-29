import { NextResponse } from "next/server";
import { getApiErrorResponse, getCurrentUserContext } from "@/lib/pos/auth";
import { checkPosBanecoQrStatus } from "@/lib/pos/baneco-qr";

export async function POST(request) {
  try {
    const input = await request.json();
    const context = await getCurrentUserContext({ redirectToLogin: false });
    const status = await checkPosBanecoQrStatus(context, input);

    return NextResponse.json({ status });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}
