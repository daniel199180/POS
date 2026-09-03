import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { cache } from "react";
import { SESSION_COOKIE } from "@/lib/appwrite/server";
import {
  ForbiddenError,
  UnauthorizedError,
  assertCanCreateProducts,
  assertCanManageCatalog,
  assertCanManagePayments,
  assertCanManageUsers,
  assertCanViewAnalytics,
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
  assertCanViewAnalytics,
  canAccessBranch,
};

const readCurrentUserContext = cache(async () => {
  const cookieStore = await cookies();
  const headersList = await headers();
  const sessionSecret = cookieStore.get(SESSION_COOKIE)?.value;
  const userAgent = headersList.get("user-agent");

  return getCurrentUserContextFromSession({ sessionSecret, userAgent });
});

export async function getCurrentUserContext({ redirectToLogin = true } = {}) {
  try {
    return await readCurrentUserContext();
  } catch (error) {
    if (error instanceof UnauthorizedError && redirectToLogin) {
      redirect("/login");
    }

    throw error;
  }
}

export function getApiErrorResponse(error) {
  const explicitStatus = Number(error?.status);
  const providerStatus = Number(error?.code);
  const status =
    explicitStatus >= 400 && explicitStatus <= 599
      ? explicitStatus
      : providerStatus >= 400 && providerStatus <= 599
        ? providerStatus
        : 500;
  const safeProviderMessages = {
    401: "No autorizado.",
    403: "No tienes permisos para esta acción.",
    404: "El recurso solicitado no existe.",
    409: "La operación entra en conflicto con el estado actual.",
    429: "Demasiadas solicitudes. Intenta nuevamente más tarde.",
  };

  if (!explicitStatus && status >= 500) {
    console.error("Error interno en API POS:", error);
  }

  return NextResponse.json(
    {
      message: explicitStatus
        ? error.message || "No se pudo completar la acción."
        : safeProviderMessages[status] || "No se pudo completar la operación.",
    },
    { status },
  );
}
