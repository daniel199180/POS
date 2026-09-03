import { AppwriteException } from "node-appwrite";
import { cookies } from "next/headers";
export {
  SESSION_COOKIE,
  createAdminAccount,
  createAdminClient,
  createBaseClient,
  createSessionAccount,
  createSessionClient,
  toPublicUser,
} from "./admin.js";
import { SESSION_COOKIE, createSessionClient } from "./admin.js";

export async function createCookieSessionClient(userAgent) {
  const cookieStore = await cookies();
  const sessionSecret = cookieStore.get(SESSION_COOKIE)?.value;

  if (!sessionSecret) {
    throw new Error("No hay sesion activa.");
  }

  return createSessionClient(sessionSecret, userAgent);
}

export function getSessionCookieOptions(expires) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    expires,
    path: "/",
  };
}

export function getClearedSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 0,
    path: "/",
  };
}

export function getAuthErrorResponse(error) {
  if (error?.status) {
    return {
      status: error.status,
      body: { message: error.message || "No se pudo iniciar sesión." },
    };
  }

  if (error.message === "APPWRITE_API_KEY is required for server-side login.") {
    return {
      status: 500,
      body: {
        message:
          "Falta APPWRITE_API_KEY en .env.local. Crea una API key server-side en Appwrite para habilitar el login seguro.",
      },
    };
  }

  if (error instanceof AppwriteException) {
    if (error.type === "user_unauthorized") {
      return {
        status: 500,
        body: {
          message:
            "APPWRITE_API_KEY no tiene permisos en este proyecto Appwrite. Crea una API key server-side para este proyecto y actualiza .env.local.",
        },
      };
    }

    if (error.code === 401) {
      return {
        status: 401,
        body: { message: "Email o contrasena incorrectos." },
      };
    }

    if (error.code === 429) {
      return {
        status: 429,
        body: {
          message:
            "Appwrite todavia tiene activo el limite de intentos. Con el login server-side ya no se hacen llamadas duplicadas; espera a que expire el bloqueo o revisa el limite de abuso del servidor.",
        },
      };
    }

    return {
      status: error.code || 400,
      body: { message: error.message },
    };
  }

  return {
    status: 500,
    body: { message: "No se pudo completar la autenticacion." },
  };
}
