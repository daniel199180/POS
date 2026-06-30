import { NextResponse } from "next/server";
import {
  ForbiddenError,
  UnauthorizedError,
  getApiErrorResponse,
  getCurrentUserContext,
} from "@/lib/pos/auth";
import {
  createSale,
  createSaleContextFromBanecoQrToken,
  listSales,
} from "@/lib/pos/sales";

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const context = await getCurrentUserContext({ redirectToLogin: false });

    if (!context.isAdmin) {
      throw new ForbiddenError("Solo un administrador puede consultar ventas.");
    }

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
    let context;

    try {
      context = await getCurrentUserContext({ redirectToLogin: false });
    } catch (error) {
      if (!(error instanceof UnauthorizedError)) {
        throw error;
      }

      context = createSaleContextFromBanecoQrToken(
        input,
        request.headers.get("user-agent"),
      );

      if (!context) {
        throw error;
      }
    }

    const sale = await createSale(context, input);

    return NextResponse.json({ sale }, { status: 201 });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}
