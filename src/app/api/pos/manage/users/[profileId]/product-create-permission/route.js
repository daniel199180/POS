import { NextResponse } from "next/server";
import { getApiErrorResponse, getCurrentUserContext } from "@/lib/pos/auth";
import { updateManagedUserProductCreatePermission } from "@/lib/pos/users";

export async function PATCH(request, { params }) {
  try {
    const { profileId } = await params;
    const input = await request.json();
    const context = await getCurrentUserContext({ redirectToLogin: false });
    const user = await updateManagedUserProductCreatePermission(
      context,
      profileId,
      input,
    );

    return NextResponse.json({ user });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}
