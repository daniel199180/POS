import { NextResponse } from "next/server";
import { getApiErrorResponse, getCurrentUserContext } from "@/lib/pos/auth";
import { deactivateBranch, updateBranch } from "@/lib/pos/management";

export async function PATCH(request, { params }) {
  try {
    const { branchId } = await params;
    const input = await request.json();
    const context = await getCurrentUserContext({ redirectToLogin: false });
    const branch = await updateBranch(context, branchId, input);

    return NextResponse.json({ branch });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}

export async function DELETE(request, { params }) {
  try {
    const { branchId } = await params;
    const context = await getCurrentUserContext({ redirectToLogin: false });
    const branch = await deactivateBranch(context, branchId);

    return NextResponse.json({ branch });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}
