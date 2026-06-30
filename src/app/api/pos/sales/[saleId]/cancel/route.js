import { NextResponse } from "next/server";
import { getApiErrorResponse, getCurrentUserContext } from "@/lib/pos/auth";
import { cancelSale } from "@/lib/pos/sales";

export async function POST(request, { params }) {
  try {
    const { saleId } = await params;
    const input = await request.json().catch(() => ({}));
    const context = await getCurrentUserContext({ redirectToLogin: false });
    const sale = await cancelSale(context, saleId, input);

    return NextResponse.json({ sale });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}
