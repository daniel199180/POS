import { NextResponse } from "next/server";
import { appwriteFunctions } from "@/lib/appwrite/functions";
import { invokePosFunction } from "@/lib/appwrite/function-proxy";
import { getApiErrorResponse } from "@/lib/pos/auth";

export async function PUT(request, { params }) {
  try {
    const { methodId } = await params;
    const input = await request.json();
    const { body, status } = await invokePosFunction(
      request,
      appwriteFunctions.payments.credentialsUpdate,
      { methodId, input },
    );

    return NextResponse.json(body, { status });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}

export async function POST(request, { params }) {
  try {
    const { methodId } = await params;
    const { body, status } = await invokePosFunction(
      request,
      appwriteFunctions.banecoQr.credentialsTest,
      { methodId },
    );

    return NextResponse.json(body, { status });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}
