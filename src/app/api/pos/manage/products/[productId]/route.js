import { NextResponse } from "next/server";
import { appwriteFunctions } from "@/lib/appwrite/functions";
import { invokePosFunction } from "@/lib/appwrite/function-proxy";
import { getApiErrorResponse } from "@/lib/pos/auth";

export async function PATCH(request, { params }) {
  try {
    const { productId } = await params;
    const input = await request.json();
    const { body, status } = await invokePosFunction(
      request,
      appwriteFunctions.management.productsUpdate,
      { productId, input },
    );

    return NextResponse.json(body, { status });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}

export async function DELETE(request, { params }) {
  try {
    const { productId } = await params;
    const { body, status } = await invokePosFunction(
      request,
      appwriteFunctions.management.productsDelete,
      { productId },
    );

    return NextResponse.json(body, { status });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}
