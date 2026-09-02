import { getApiErrorResponse, getCurrentUserContext } from "@/lib/pos/auth";
import { buildDailyIncomePdf } from "@/lib/pos/daily-income-pdf";
import { getDailyIncomeReport } from "@/lib/pos/sales";

export const runtime = "nodejs";

function safeFilePart(value = "reporte") {
  return String(value || "reporte")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const context = await getCurrentUserContext({ redirectToLogin: false });
    const report = await getDailyIncomeReport(context, {
      branchId: url.searchParams.get("branchId"),
    });
    const pdf = buildDailyIncomePdf(report);
    const filename = [
      "ingresos",
      report.date,
      safeFilePart(report.branch?.code || report.branch?.name),
      safeFilePart(report.cashier?.name || report.cashier?.email),
      safeFilePart(report.generatedAt),
    ]
      .filter(Boolean)
      .join("-");

    return new Response(pdf, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${filename}.pdf"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}
