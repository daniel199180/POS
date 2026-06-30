import { NextResponse } from "next/server";
import { getApiErrorResponse, getCurrentUserContext } from "@/lib/pos/auth";
import { deactivateProduct, updateProduct } from "@/lib/pos/management";

export async function PATCH(request, { params }) {
  try {
    const { productId } = await params;
    const input = await request.json();
    const context = await getCurrentUserContext({ redirectToLogin: false });
    const updatedProductId = await updateProduct(context, productId, input);

    return NextResponse.json({ productId: updatedProductId });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}

export async function DELETE(request, { params }) {
  try {
    const { productId } = await params;
    const context = await getCurrentUserContext({ redirectToLogin: false });
    const deletedProductId = await deactivateProduct(context, productId);

    return NextResponse.json({ productId: deletedProductId });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}
