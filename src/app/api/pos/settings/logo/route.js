import { NextResponse } from "next/server";
import { getApiErrorResponse, getCurrentUserContext } from "@/lib/pos/auth";
import { deleteLogo, getLogoImage, uploadLogo } from "@/lib/pos/settings";

export const runtime = "nodejs";

export async function GET() {
  try {
    const context = await getCurrentUserContext({ redirectToLogin: false });
    const logo = await getLogoImage(context);

    return new Response(logo.data, {
      headers: {
        "content-type": logo.mimeType,
        "cache-control": "private, max-age=300",
        "x-logo-updated-at": logo.updatedAt,
      },
    });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}

export async function POST(request) {
  try {
    const context = await getCurrentUserContext({ redirectToLogin: false });
    const formData = await request.formData();
    const file = formData.get("logo");
    const settings = await uploadLogo(context, file);

    return NextResponse.json({ settings });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}

export async function DELETE() {
  try {
    const context = await getCurrentUserContext({ redirectToLogin: false });
    const settings = await deleteLogo(context);

    return NextResponse.json({ settings });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}
