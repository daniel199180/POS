import { NextResponse } from "next/server";
import { getApiErrorResponse, getCurrentUserContext } from "@/lib/pos/auth";
import { createStaticQr, listStaticQrs } from "@/lib/pos/static-qrs";

export async function GET(request) {
  try {
    const context = await getCurrentUserContext({ redirectToLogin: false });
    const url = new URL(request.url);
    return NextResponse.json(
      await listStaticQrs(context, {
        branchId: url.searchParams.get("branchId"),
        createdByUserId: url.searchParams.get("createdByUserId"),
        status: url.searchParams.get("status"),
        archived: url.searchParams.get("archived"),
        page: url.searchParams.get("page"),
        pageSize: url.searchParams.get("pageSize"),
      }),
    );
  } catch (error) {
    return getApiErrorResponse(error);
  }
}

export async function POST(request) {
  try {
    const context = await getCurrentUserContext({ redirectToLogin: false });
    return NextResponse.json(
      { qr: await createStaticQr(context, await request.json()) },
      { status: 201 },
    );
  } catch (error) {
    return getApiErrorResponse(error);
  }
}
