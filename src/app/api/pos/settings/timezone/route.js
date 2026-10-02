import { NextResponse } from "next/server";
import { getApiErrorResponse, getCurrentUserContext } from "@/lib/pos/auth";
import {
  getTimeZoneSettings,
  updateTimeZoneSettings,
} from "@/lib/pos/settings";

export async function GET() {
  try {
    const context = await getCurrentUserContext({ redirectToLogin: false });
    return NextResponse.json({ settings: await getTimeZoneSettings(context) });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}

export async function PATCH(request) {
  try {
    const context = await getCurrentUserContext({ redirectToLogin: false });
    const input = await request.json().catch(() => ({}));
    return NextResponse.json({
      settings: await updateTimeZoneSettings(context, input),
    });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}
