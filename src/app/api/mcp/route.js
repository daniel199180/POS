import { timingSafeEqual } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod/v4";
import { getAgentDailyReport } from "@/lib/pos/agent-reports";
import { getMcpAccessToken } from "@/lib/pos/mcp-settings";

export const runtime = "nodejs";

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

function agentContext() {
  return {
    user: { id: "agent-report", name: "Agent report", email: "" },
    profile: { role: "super_admin", name: "Agent report" },
    userAgent: "agent-report-mcp",
    isAdmin: true,
    isSuperAdmin: true,
    canViewAnalytics: true,
    allowedBranchIds: [],
  };
}

function createServer() {
  const server = new McpServer({
    name: "pos-income-agent",
    version: "1.0.0",
  });

  server.registerTool(
    "daily_income_report",
    {
      description:
        "Devuelve el reporte diario por sucursal en bolivianos, separado por efectivo, QR, tarjeta, productos/materiales y mensualidades, además de alertas de stock bajo.",
      inputSchema: {
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe(
            "Fecha local de Bolivia en formato YYYY-MM-DD. Si se omite usa hoy.",
          ),
      },
    },
    async ({ date }) => {
      const report = await getAgentDailyReport(agentContext(), { date });
      return {
        content: [{ type: "text", text: JSON.stringify(report) }],
        structuredContent: report,
      };
    },
  );

  return server;
}

export async function POST(request) {
  if (!(await authorized(request))) {
    return Response.json({ message: "No autorizado." }, { status: 401 });
  }

  const server = createServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  await server.connect(transport);
  return transport.handleRequest(request);
}

export async function GET() {
  return Response.json(
    { message: "Usa POST para el endpoint MCP." },
    { status: 405 },
  );
}

export async function DELETE() {
  return Response.json(
    { message: "Sesiones stateless; no hay nada que cerrar." },
    { status: 405 },
  );
}
