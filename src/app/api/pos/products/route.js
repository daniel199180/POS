import { NextResponse } from "next/server";
import { getApiErrorResponse, getCurrentUserContext } from "@/lib/pos/auth";
import { PRODUCT_PAGE_SIZE, getProductsPage } from "@/lib/pos/catalog";
import { assertPosTabEnabled } from "@/lib/pos/pos-ui-settings";

export async function GET(request) {
  try {
    const context = await getCurrentUserContext({ redirectToLogin: false });
    const url = new URL(request.url);
    const branchId = url.searchParams.get("branchId") || "";
    const search = url.searchParams.get("search") || "";
    const offset = Number(url.searchParams.get("offset") || 0);
    const limit = Number(url.searchParams.get("limit") || PRODUCT_PAGE_SIZE);

    if (!branchId) {
      return NextResponse.json(
        { message: "Selecciona una sucursal." },
        { status: 400 },
      );
    }

    await assertPosTabEnabled(context, branchId, "products");

    const page = await getProductsPage({
      userAgent: context.userAgent,
      context,
      branchId,
      search,
      offset,
      limit: Math.min(Math.max(limit, 1), PRODUCT_PAGE_SIZE),
    });

    return NextResponse.json(page);
  } catch (error) {
    return getApiErrorResponse(error);
  }
}
