import { getApiErrorResponse } from "@/lib/pos/auth";
import { getPublicCatalogImage } from "@/lib/pos/public-catalog";

export const runtime = "nodejs";

export async function GET(request, { params }) {
  try {
    const { code, productId } = await params;
    const image = await getPublicCatalogImage(
      code,
      productId,
      request.headers.get("user-agent") || "",
    );
    return new Response(image.data, {
      headers: {
        "content-type": image.mimeType,
        "cache-control": "public, max-age=60",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}
