import { NextResponse } from "next/server";
import { getApiErrorResponse, getCurrentUserContext } from "@/lib/pos/auth";
import {
  testStoredBanecoCredentials,
  updateBanecoCredentials,
} from "@/lib/pos/payments";

export async function PUT(request, { params }) {
  try {
    const { methodId } = await params;
    const input = await request.json();
    const context = await getCurrentUserContext({ redirectToLogin: false });
    const credentials = await updateBanecoCredentials(context, methodId, input);

    return NextResponse.json({ credentials });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}

export async function POST(request, { params }) {
  try {
    const { methodId } = await params;
    const context = await getCurrentUserContext({ redirectToLogin: false });
    const credentials = await testStoredBanecoCredentials(context, methodId);

    return NextResponse.json({ credentials });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}
