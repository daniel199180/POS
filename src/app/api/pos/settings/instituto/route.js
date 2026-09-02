import { NextResponse } from "next/server";
import { getApiErrorResponse, getCurrentUserContext } from "@/lib/pos/auth";
import {
  getInstituteConnectionSettings,
  saveInstituteConnectionSettings,
  testInstituteConnection,
} from "@/lib/pos/institute-settings";

export async function GET() {
  try {
    const context = await getCurrentUserContext({ redirectToLogin: false });
    return NextResponse.json({ settings: await getInstituteConnectionSettings(context) });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}

export async function PUT(request) {
  try {
    const context = await getCurrentUserContext({ redirectToLogin: false });
    const input = await request.json().catch(() => null);
    if (!input || typeof input !== "object") {
      return NextResponse.json({ message: "Configuración inválida." }, { status: 400 });
    }
    return NextResponse.json({ settings: await saveInstituteConnectionSettings(context, input) });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}

export async function POST(request) {
  try {
    const context = await getCurrentUserContext({ redirectToLogin: false });
    const input = await request.json().catch(() => ({}));
    return NextResponse.json(await testInstituteConnection(context, input));
  } catch (error) {
    return getApiErrorResponse(error);
  }
}
