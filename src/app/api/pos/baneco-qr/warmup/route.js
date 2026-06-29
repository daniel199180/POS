import { NextResponse } from "next/server";
import { getApiErrorResponse, getCurrentUserContext } from "@/lib/pos/auth";
import { warmupPosBanecoQr } from "@/lib/pos/baneco-qr";

export async function POST(request) {
  try {
    const input = await request.json();
    const context = await getCurrentUserContext({ redirectToLogin: false });
    const warmup = await warmupPosBanecoQr(context, input);

    return NextResponse.json({ warmup });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}
