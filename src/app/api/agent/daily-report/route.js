import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getAgentDailyReport } from "@/lib/pos/agent-reports";
import { getMcpAccessToken } from "@/lib/pos/mcp-settings";
import { getApiErrorResponse } from "@/lib/pos/auth";

async function authorized(request) {
  const expected = await getMcpAccessToken(
    request.headers.get("user-agent") || "",
  );
  const received =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!expected || !received) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(received);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function GET(request) {
  try {
    if (!(await authorized(request))) {
      return NextResponse.json({ message: "No autorizado." }, { status: 401 });
    }

    const context = {
      user: { id: "agent-report", name: "Agent report", email: "" },
      profile: { role: "super_admin", name: "Agent report" },
      userAgent: "agent-report-mcp",
      isAdmin: true,
      isSuperAdmin: true,
      canViewAnalytics: true,
      allowedBranchIds: [],
    };
    const url = new URL(request.url);
    const report = await getAgentDailyReport(context, {
      date: url.searchParams.get("date") || undefined,
    });

    return NextResponse.json(
      { report },
      {
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (error) {
    return getApiErrorResponse(error);
  }
}
