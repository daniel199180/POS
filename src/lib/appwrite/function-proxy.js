import { cookies } from "next/headers";
import { createAdminClient } from "./admin.js";
import { getPosFunctionExecutor } from "./functions.js";
import { SESSION_COOKIE } from "./server.js";

export class AppwriteFunctionError extends Error {
  constructor(message, status = 500, body = {}) {
    super(message || "No se pudo completar la accion.");
    this.status = status;
    this.body = body;
  }
}

function parseExecutionBody(execution) {
  const rawBody = execution.responseBody || "";

  if (!rawBody) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    return {
      message: rawBody,
    };
  }
}

function isSyncTimeout(execution, body, status) {
  return (
    status === 408 ||
    String(body.message || execution.errors || "")
      .toLowerCase()
      .includes("synchronous function execution timed out")
  );
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function createExecution(
  functions,
  executorFunctionId,
  functionId,
  payload,
) {
  return functions.createExecution({
    functionId: executorFunctionId,
    body: JSON.stringify({
      ...payload,
      targetFunctionId: functionId,
    }),
    async: false,
    xpath: "/",
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
  });
}

export async function invokePosFunction(request, functionId, payload = {}) {
  const cookieStore = await cookies();
  const sessionSecret = cookieStore.get(SESSION_COOKIE)?.value;

  if (!sessionSecret) {
    throw new AppwriteFunctionError("No autorizado.", 401);
  }

  const userAgent = request.headers.get("user-agent") || "";
  const { functions } = createAdminClient(userAgent);
  const executorFunctionId = getPosFunctionExecutor(functionId);
  const executionPayload = {
    ...payload,
    sessionSecret,
    userAgent,
  };
  let execution = await createExecution(
    functions,
    executorFunctionId,
    functionId,
    executionPayload,
  );
  const body = parseExecutionBody(execution);
  let responseBody = body;
  let responseStatusCode = Number(execution.responseStatusCode || 0);
  let status =
    responseStatusCode ||
    (execution.status === "completed" || execution.status === "succeeded"
      ? 200
      : 500);

  if (isSyncTimeout(execution, responseBody, status)) {
    await wait(750);
    execution = await createExecution(
      functions,
      executorFunctionId,
      functionId,
      executionPayload,
    );
    responseBody = parseExecutionBody(execution);
    responseStatusCode = Number(execution.responseStatusCode || 0);
    status =
      responseStatusCode ||
      (execution.status === "completed" || execution.status === "succeeded"
        ? 200
        : 500);
  }

  if (status >= 400 || execution.status === "failed") {
    throw new AppwriteFunctionError(
      responseBody.message ||
        execution.errors ||
        "La funcion de Appwrite fallo.",
      status,
      responseBody,
    );
  }

  return {
    body: responseBody,
    status,
  };
}
