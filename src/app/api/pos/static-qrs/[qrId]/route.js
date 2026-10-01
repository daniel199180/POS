import { NextResponse } from "next/server";
import { getApiErrorResponse, getCurrentUserContext } from "@/lib/pos/auth";
import {
  cancelStaticQr,
  checkStaticQr,
  getStaticQrDetails,
} from "@/lib/pos/static-qrs";

export async function GET(_request, { params }) {
  try {
    const context = await getCurrentUserContext({ redirectToLogin: false });
    const { qrId } = await params;
    return NextResponse.json(await getStaticQrDetails(context, qrId));
  } catch (error) {
    return getApiErrorResponse(error);
  }
}

export async function POST(request, { params }) {
  try {
    const context = await getCurrentUserContext({ redirectToLogin: false });
    const { qrId } = await params;
    const input = await request.json().catch(() => ({}));
    if (input.action !== "status") {
      const error = new Error("Acción no soportada.");
      error.status = 400;
      throw error;
    }
    return NextResponse.json(await checkStaticQr(context, qrId));
  } catch (error) {
    return getApiErrorResponse(error);
  }
}

export async function DELETE(_request, { params }) {
  try {
    const context = await getCurrentUserContext({ redirectToLogin: false });
    const { qrId } = await params;
    return NextResponse.json({ qr: await cancelStaticQr(context, qrId) });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}
