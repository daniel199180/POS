import { Databases } from "node-appwrite";
import { createAdminClient } from "./admin.js";

// Server transaction support for the existing SDK 18 document API.
export async function withTransaction(userAgent, work) {
  const { client } = createAdminClient(userAgent);
  const headers = { "content-type": "application/json" };
  const url = (path) =>
    new URL(`${client.config.endpoint}/databases/transactions${path}`);
  const transaction = await client.call("post", url(""), headers, { ttl: 300 });
  const scopedClient = new Proxy(client, {
    get(target, property) {
      if (property === "call") {
        return (method, uri, requestHeaders, payload = {}, ...rest) =>
          target.call(
            method,
            uri,
            requestHeaders,
            {
              ...payload,
              ...(uri.pathname.includes("/documents")
                ? { transactionId: transaction.$id }
                : {}),
            },
            ...rest,
          );
      }
      return Reflect.get(target, property);
    },
  });
  try {
    const result = await work(new Databases(scopedClient));
    try {
      await client.call("patch", url(`/${transaction.$id}`), headers, {
        commit: true,
      });
    } catch (error) {
      const state = await client.call(
        "get",
        url(`/${transaction.$id}`),
        headers,
        {},
      );
      if (state.status !== "committed") throw error;
    }
    return result;
  } catch (error) {
    await client
      .call("patch", url(`/${transaction.$id}`), headers, { rollback: true })
      .catch(() => {});
    throw error;
  }
}

function isTransactionConflict(error) {
  return error?.code === 409;
}

export async function withTransactionRetry(
  userAgent,
  work,
  { maxAttempts = 3 } = {},
) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await withTransaction(userAgent, work);
    } catch (error) {
      lastError = error;
      if (!isTransactionConflict(error) || attempt === maxAttempts) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, attempt * 25));
    }
  }

  throw lastError;
}
