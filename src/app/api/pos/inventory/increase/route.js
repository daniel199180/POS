import { NextResponse } from "next/server";
import { getApiErrorResponse, getCurrentUserContext } from "@/lib/pos/auth";
import { increaseProductStock } from "@/lib/pos/inventory";

export async function POST(request) {
  try {
    const input = await request.json();
    const context = await getCurrentUserContext({ redirectToLogin: false });
    const result = await increaseProductStock(context, input);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}
