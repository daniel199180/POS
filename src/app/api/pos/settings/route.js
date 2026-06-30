import { NextResponse } from "next/server";
import { getApiErrorResponse, getCurrentUserContext } from "@/lib/pos/auth";
import { getLogoSettings } from "@/lib/pos/settings";

export async function GET() {
  try {
    const context = await getCurrentUserContext({ redirectToLogin: false });
    const settings = await getLogoSettings(context);

    return NextResponse.json({ settings });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}
