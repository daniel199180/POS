import { NextResponse } from "next/server";
import { getApiErrorResponse, getCurrentUserContext } from "@/lib/pos/auth";
import { listCategories, saveCategory } from "@/lib/pos/categories";

export async function GET() {
  try {
    const context = await getCurrentUserContext({ redirectToLogin: false });
    return NextResponse.json({ categories: await listCategories(context) });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}

export async function POST(request) {
  try {
    const context = await getCurrentUserContext({ redirectToLogin: false });
    const category = await saveCategory(context, await request.json());
    return NextResponse.json({ category }, { status: 201 });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}
