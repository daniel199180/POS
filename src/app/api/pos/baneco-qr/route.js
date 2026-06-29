import { NextResponse } from "next/server";
import { getApiErrorResponse, getCurrentUserContext } from "@/lib/pos/auth";
import { generatePosBanecoQr } from "@/lib/pos/baneco-qr";

export async function POST(request) {
  try {
    const input = await request.json();
    const context = await getCurrentUserContext({ redirectToLogin: false });
    const qr = await generatePosBanecoQr(context, input);

    return NextResponse.json({ qr }, { status: 201 });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}
