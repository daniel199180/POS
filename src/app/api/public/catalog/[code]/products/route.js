import { NextResponse } from "next/server";
import { getApiErrorResponse } from "@/lib/pos/auth";
import { getPublicCatalog } from "@/lib/pos/public-catalog";

export const runtime = "nodejs";

export async function GET(request, { params }) {
  try {
    const { code } = await params;
    const url = new URL(request.url);
    const result = await getPublicCatalog(
      code,
      request.headers.get("user-agent") || "",
      {
        search: url.searchParams.get("search"),
        categoryId: url.searchParams.get("categoryId"),
        sort: url.searchParams.get("sort"),
        page: url.searchParams.get("page"),
      },
    );
    return NextResponse.json(result, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}
