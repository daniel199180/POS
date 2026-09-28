import { NextResponse } from "next/server";
import { getApiErrorResponse, getCurrentUserContext } from "@/lib/pos/auth";
import { createPaymentLink, listPaymentLinks } from "@/lib/pos/payment-links";

export async function GET(request) {
  try {
    const context = await getCurrentUserContext({ redirectToLogin: false });
    const url = new URL(request.url);
    const links = await listPaymentLinks(context, {
      branchId: url.searchParams.get("branchId"),
      cursor: url.searchParams.get("cursor"),
      limit: url.searchParams.get("limit"),
      filter: url.searchParams.get("filter"),
    });

    return NextResponse.json(links);
  } catch (error) {
    return getApiErrorResponse(error);
  }
}

export async function POST(request) {
  try {
    const context = await getCurrentUserContext({ redirectToLogin: false });
    const link = await createPaymentLink(context, await request.json());
    return NextResponse.json({ link }, { status: 201 });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}
