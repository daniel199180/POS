import { timingSafeEqual } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod/v4";
import { getAgentDailyReport } from "@/lib/pos/agent-reports";
import {
  getAgentInventoryMovementsReport,
  getAgentInventoryReport,
  getAgentInventoryStock,
} from "@/lib/pos/agent-inventory";
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

  const branchId = z
    .string()
    .min(1)
    .optional()
    .describe("ID de sucursal. Si se omite, incluye todas.");
  const page = z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Página de resultados; inicia en 1.");
  const pageSize = z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Registros por página; máximo 100.");
  const date = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("Fecha local en formato YYYY-MM-DD.");
  const result = (report) => ({
    content: [{ type: "text", text: JSON.stringify(report) }],
    structuredContent: report,
  });

  server.registerTool(
    "inventory_stock",
    {
      description:
        "Consulta existencias actuales de productos activos por sucursal, con SKU, cantidad, mínimos y estado. Permite buscar y paginar.",
      inputSchema: {
        branchId,
        search: z
          .string()
          .max(200)
          .optional()
          .describe("Busca por nombre, SKU o código de barras."),
        status: z
          .enum(["all", "in_stock", "low_stock", "out_of_stock"])
          .optional()
          .describe("Filtra por disponibilidad."),
        page,
        pageSize,
      },
    },
    async (filters) =>
      result(await getAgentInventoryStock(agentContext(), filters)),
  );

  server.registerTool(
    "inventory_report",
    {
      description:
        "Resume el inventario actual por sucursal: productos disponibles, stock bajo y agotados, valor conocido al costo y hasta 100 alertas. Para todas las alertas usa inventory_stock con status y páginas.",
      inputSchema: { branchId },
    },
    async (filters) =>
      result(await getAgentInventoryReport(agentContext(), filters)),
  );

  server.registerTool(
    "inventory_movements_report",
    {
      description:
        "Reporta entradas, salidas, ajustes y transferencias de inventario por período y sucursal. Devuelve totales completos y movimientos paginados.",
      inputSchema: {
        dateFrom: date.describe(
          "Inicio del período. Por defecto, hace 29 días.",
        ),
        dateTo: date.describe("Fin del período. Por defecto, hoy."),
        branchId,
        productId: z.string().min(1).optional().describe("ID del producto."),
        page,
        pageSize,
      },
    },
    async (filters) =>
      result(await getAgentInventoryMovementsReport(agentContext(), filters)),
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
