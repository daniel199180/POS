import { NextResponse } from "next/server";
import { appwriteFunctions } from "@/lib/appwrite/functions";
import { invokePosFunction } from "@/lib/appwrite/function-proxy";
import { getApiErrorResponse } from "@/lib/pos/auth";

export async function PATCH(request, { params }) {
  try {
    const { branchId } = await params;
    const input = await request.json();
    const { body, status } = await invokePosFunction(
      request,
      appwriteFunctions.management.branchesUpdate,
      { branchId, input },
    );

    return NextResponse.json(body, { status });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}

export async function DELETE(request, { params }) {
  try {
    const { branchId } = await params;
    const { body, status } = await invokePosFunction(
      request,
      appwriteFunctions.management.branchesDelete,
      { branchId },
    );

    return NextResponse.json(body, { status });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}
