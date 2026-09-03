import { getApiErrorResponse } from "@/lib/pos/auth";
import { getPaymentLinkLogo } from "@/lib/pos/payment-links";

export const runtime = "nodejs";

export async function GET(request, { params }) {
  try {
    const { token } = await params;
    const logo = await getPaymentLinkLogo(
      token,
      request.headers.get("user-agent"),
    );
    return new Response(logo.data, {
      headers: {
        "content-type": logo.mimeType,
        "cache-control": "private, max-age=300",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
      },
    });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}
