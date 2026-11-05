import { NextResponse } from "next/server";
import { getApiErrorResponse, getCurrentUserContext } from "@/lib/pos/auth";
import { saveCategory } from "@/lib/pos/categories";

export async function PATCH(request, { params }) {
  try {
    const { categoryId } = await params;
    const context = await getCurrentUserContext({ redirectToLogin: false });
    const category = await saveCategory(
      context,
      await request.json(),
      categoryId,
    );
    return NextResponse.json({ category });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}
