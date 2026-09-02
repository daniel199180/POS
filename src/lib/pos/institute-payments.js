import "server-only";
import { getInstituteApiRequestConfig } from "./institute-settings.js";

async function readResponse(response) {
  const body = await response.text();

  try {
    return body ? JSON.parse(body) : {};
  } catch {
    return { error: "Control Instituto devolvió una respuesta inválida." };
  }
}

export async function requestInstitutePayments(path, options = {}) {
  const { baseUrl, token } = await getInstituteApiRequestConfig();
  const response = await fetch(`${baseUrl}/api/registro-pagos${path}`, {
    ...options,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const body = await readResponse(response);

  return { body, status: response.status };
}
