import { NextResponse } from "next/server";
import { getApiErrorResponse } from "@/lib/pos/auth";
import {
  checkPublicPaymentLink,
  generatePublicPaymentLinkQr,
  getPublicPaymentLink,
} from "@/lib/pos/payment-links";
import { assertRateLimit, requestFingerprint } from "@/lib/security/rate-limit";

function noStore(payload, init) {
  const response = NextResponse.json(payload, init);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function GET(request, { params }) {
  try {
    const { token } = await params;
    assertRateLimit({
      namespace: "payment-link-read",
      key: requestFingerprint(request, token),
      limit: 120,
      windowMs: 60_000,
    });
    const link = await getPublicPaymentLink(
      token,
      request.headers.get("user-agent"),
    );
    return noStore({ link });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}

export async function POST(request, { params }) {
  try {
    const { token } = await params;
    const input = await request.json().catch(() => ({}));
    const action = input.action === "status" ? "status" : "generate";
    assertRateLimit({
      namespace: `payment-link-${action}`,
      key: requestFingerprint(request, token),
      limit: action === "status" ? 30 : 10,
      windowMs: 60_000,
    });
    const link =
      action === "status"
        ? await checkPublicPaymentLink(token, request.headers.get("user-agent"))
        : await generatePublicPaymentLinkQr(
            token,
            request.headers.get("user-agent"),
          );
    return noStore({ link });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}
