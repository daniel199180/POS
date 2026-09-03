import { NextResponse } from "next/server";
import { getApiErrorResponse, getCurrentUserContext } from "@/lib/pos/auth";
import { deleteManagedUser, updateManagedUser } from "@/lib/pos/users";

export async function PATCH(request, { params }) {
  try {
    const { profileId } = await params;
    const input = await request.json();
    const context = await getCurrentUserContext({ redirectToLogin: false });
    const user = await updateManagedUser(context, profileId, input);

    return NextResponse.json({ user });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}

export async function DELETE(request, { params }) {
  try {
    const { profileId } = await params;
    const context = await getCurrentUserContext({ redirectToLogin: false });
    const user = await deleteManagedUser(context, profileId);

    return NextResponse.json({ user });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}
