import { getApiErrorResponse } from "@/lib/pos/auth";
import { getLogoImage } from "@/lib/pos/settings";

export const runtime = "nodejs";

const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function GET(request) {
  try {
    const logo = await getLogoImage({
      userAgent: request.headers.get("user-agent") || "",
    });
    if (!allowedTypes.has(logo.mimeType)) {
      return Response.json({ message: "Logo no disponible." }, { status: 404 });
    }
    return new Response(logo.data, {
      headers: {
        "content-type": logo.mimeType,
        "cache-control": "public, max-age=300",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}
