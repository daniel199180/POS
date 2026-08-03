import { NextResponse } from "next/server";
import { getApiErrorResponse, getCurrentUserContext } from "@/lib/pos/auth";
import { listStockMovements } from "@/lib/pos/inventory";

export async function GET() {
  try {
    const context = await getCurrentUserContext({ redirectToLogin: false });
    const movements = await listStockMovements(context);

    return NextResponse.json({ movements });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}
