import { NextResponse } from "next/server";
import { getCurrentUserContext, getApiErrorResponse } from "@/lib/pos/auth";
import { getMcpSettings, updateMcpSettings } from "@/lib/pos/mcp-settings";

export async function GET() {
  try {
    const context = await getCurrentUserContext({ redirectToLogin: false });
    return NextResponse.json({ settings: await getMcpSettings(context) });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}

export async function POST(request) {
  try {
    const context = await getCurrentUserContext({ redirectToLogin: false });
    const input = await request.json().catch(() => ({}));
    const result = await updateMcpSettings(context, {
      enabled: input.enabled,
      rotateToken: input.rotateToken === true,
    });

    return NextResponse.json(result);
  } catch (error) {
    return getApiErrorResponse(error);
  }
}

export async function PATCH(request) {
  return POST(request);
}
