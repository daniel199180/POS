import { NextResponse } from "next/server";
import { getApiErrorResponse, getCurrentUserContext } from "@/lib/pos/auth";
import { getDailyIncomeReport } from "@/lib/pos/sales";

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const context = await getCurrentUserContext({ redirectToLogin: false });
    const report = await getDailyIncomeReport(context, {
      branchId: url.searchParams.get("branchId"),
    });

    return NextResponse.json({
      report: {
        date: report.date,
        generatedAt: report.generatedAt,
        branch: report.branch,
        cashier: report.cashier,
        summary: report.summary,
        sales: report.sales,
        salesCount: report.sales.length,
        totalRecords: report.totalRecords,
        isLimited: report.isLimited,
      },
    });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}
