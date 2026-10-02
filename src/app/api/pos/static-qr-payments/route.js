import { NextResponse } from "next/server";
import { getApiErrorResponse, getCurrentUserContext } from "@/lib/pos/auth";
import { listStaticQrPayments } from "@/lib/pos/static-qrs";

export async function GET(request) {
  try {
    const context = await getCurrentUserContext({ redirectToLogin: false });
    const url = new URL(request.url);
    return NextResponse.json(
      await listStaticQrPayments(context, {
        branchId: url.searchParams.get("branchId"),
        staticQrId: url.searchParams.get("staticQrId"),
        page: url.searchParams.get("page"),
        pageSize: url.searchParams.get("pageSize"),
      }),
    );
  } catch (error) {
    return getApiErrorResponse(error);
  }
}
