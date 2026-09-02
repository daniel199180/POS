import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/appwrite/server";
import {
  ForbiddenError,
  UnauthorizedError,
  assertCanCreateProducts,
  assertCanManageCatalog,
  assertCanManagePayments,
  assertCanManageUsers,
  canAccessBranch,
  getCurrentUserContextFromSession,
} from "@/lib/pos/auth-core";

export {
  ForbiddenError,
  UnauthorizedError,
  assertCanCreateProducts,
  assertCanManageCatalog,
  assertCanManagePayments,
  assertCanManageUsers,
  canAccessBranch,
};

export async function getCurrentUserContext({ redirectToLogin = true } = {}) {
  const cookieStore = await cookies();
  const headersList = await headers();
  const sessionSecret = cookieStore.get(SESSION_COOKIE)?.value;
  const userAgent = headersList.get("user-agent");

  try {
    return await getCurrentUserContextFromSession({
      sessionSecret,
      userAgent,
    });
  } catch (error) {
    if (error instanceof UnauthorizedError && redirectToLogin) {
      redirect("/login");
    }

    throw error;
  }
}

export function getApiErrorResponse(error) {
  return NextResponse.json(
    { message: error.message || "No se pudo completar la accion." },
    { status: error.status || error.code || 500 },
  );
}
