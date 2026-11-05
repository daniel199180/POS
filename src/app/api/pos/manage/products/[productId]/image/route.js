import { NextResponse } from "next/server";
import { getApiErrorResponse, getCurrentUserContext } from "@/lib/pos/auth";
import {
  getManagedProductImage,
  uploadProductImage,
} from "@/lib/pos/product-images";

export const runtime = "nodejs";

export async function POST(request, { params }) {
  try {
    const { productId } = await params;
    const context = await getCurrentUserContext({ redirectToLogin: false });
    const form = await request.formData();
    return NextResponse.json(
      await uploadProductImage(context, productId, form.get("image")),
    );
  } catch (error) {
    return getApiErrorResponse(error);
  }
}

export async function GET(request, { params }) {
  try {
    const { productId } = await params;
    const context = await getCurrentUserContext({ redirectToLogin: false });
    const image = await getManagedProductImage(context, productId);
    return new Response(image.data, {
      headers: {
        "content-type": image.mimeType,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}
