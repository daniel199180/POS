import { NextResponse } from "next/server";
import { getApiErrorResponse, getCurrentUserContext } from "@/lib/pos/auth";
import {
  getPosTabSettings,
  updatePosTabSettings,
} from "@/lib/pos/pos-ui-settings";

export async function GET(request) {
  try {
    const context = await getCurrentUserContext({ redirectToLogin: false });
    if (!context.isAdmin) {
      const error = new Error(
        "Solo un administrador puede ver esta configuración.",
      );
      error.status = 403;
      throw error;
    }
    const branchId = new URL(request.url).searchParams.get("branchId") || "";
    return NextResponse.json(await getPosTabSettings(context, branchId));
  } catch (error) {
    return getApiErrorResponse(error);
  }
}

export async function PATCH(request) {
  try {
    const context = await getCurrentUserContext({ redirectToLogin: false });
    const input = await request.json();
    return NextResponse.json(await updatePosTabSettings(context, input));
  } catch (error) {
    return getApiErrorResponse(error);
  }
}
