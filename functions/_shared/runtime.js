import "./fetch-polyfill.js";

import {
  ForbiddenError,
  UnauthorizedError,
  getCurrentUserContextFromSession,
} from "../../src/lib/pos/auth-core.js";

export function parseBody(req) {
  const candidates = [
    req.bodyJson,
    req.body,
    req.bodyText,
    req.bodyRaw,
    req.payload,
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    if (typeof candidate === "object" && !Buffer.isBuffer(candidate)) {
      return candidate;
    }

    const text =
      typeof candidate === "string"
        ? candidate
        : Buffer.from(candidate).toString("utf8");

    if (!text.trim()) {
      continue;
    }

    try {
      return JSON.parse(text);
    } catch {
      const error = new Error("El cuerpo de la solicitud es invalido.");
      error.status = 400;
      throw error;
    }
  }

  return {};
}

export async function getFunctionRequest(req) {
  const body = parseBody(req);
  const context = await getCurrentUserContextFromSession({
    sessionSecret: body.sessionSecret,
    userAgent: body.userAgent || req.headers?.["user-agent"] || "",
  });

  return {
    body,
    context,
    functionId:
      body.targetFunctionId ||
      process.env.APPWRITE_FUNCTION_ID ||
      req.headers?.["x-appwrite-function-id"] ||
      "",
  };
}

export function sendJson(res, body, status = 200) {
  return res.json(body, status);
}

export function sendError(res, error) {
  const status = error.status || error.code || 500;
  const message =
    error instanceof UnauthorizedError || error instanceof ForbiddenError
      ? error.message
      : error.message || "No se pudo completar la accion.";

  return res.json({ message }, status);
}
