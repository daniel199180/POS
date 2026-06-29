import { NextResponse } from "next/server";
import { appwriteFunctions } from "@/lib/appwrite/functions";
import { invokePosFunction } from "@/lib/appwrite/function-proxy";
import { getApiErrorResponse } from "@/lib/pos/auth";

export async function POST(request, { params }) {
  try {
    const { saleId } = await params;
    const input = await request.json().catch(() => ({}));
    const { body, status } = await invokePosFunction(
      request,
      appwriteFunctions.sales.cancel,
      { saleId, input },
    );

    return NextResponse.json(body, { status });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}
