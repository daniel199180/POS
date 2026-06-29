import { NextResponse } from "next/server";
import { getApiErrorResponse, getCurrentUserContext } from "@/lib/pos/auth";
import { createSale, listSales } from "@/lib/pos/sales";

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const context = await getCurrentUserContext({ redirectToLogin: false });
    const payload = await listSales(context, {
      page: url.searchParams.get("page"),
      pageSize: url.searchParams.get("pageSize"),
      dateFrom: url.searchParams.get("dateFrom"),
      dateTo: url.searchParams.get("dateTo"),
      branchId: url.searchParams.get("branchId"),
      paymentType: url.searchParams.get("paymentType"),
      cashierId: url.searchParams.get("cashierId"),
      status: url.searchParams.get("status"),
      search: url.searchParams.get("search"),
    });

    return NextResponse.json(payload);
  } catch (error) {
    return getApiErrorResponse(error);
  }
}

export async function POST(request) {
  try {
    const input = await request.json();
    const context = await getCurrentUserContext({ redirectToLogin: false });
    const sale = await createSale(context, input);

    return NextResponse.json({ sale }, { status: 201 });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}
