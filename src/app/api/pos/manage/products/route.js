import { NextResponse } from "next/server";
import {
  ForbiddenError,
  getApiErrorResponse,
  getCurrentUserContext,
} from "@/lib/pos/auth";
import { createProduct, listProducts } from "@/lib/pos/management";

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const context = await getCurrentUserContext({ redirectToLogin: false });
    if (!context.canManageCatalog && !context.canIncreaseInventory) {
      throw new ForbiddenError();
    }
    const products = await listProducts(context, {
      search: url.searchParams.get("search") || "",
    });

    return NextResponse.json({ products });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}

export async function POST(request) {
  try {
    const input = await request.json();
    const context = await getCurrentUserContext({ redirectToLogin: false });
    const productId = await createProduct(context, input);

    return NextResponse.json({ productId }, { status: 201 });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}
