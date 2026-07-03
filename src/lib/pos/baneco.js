import http from "node:http";
import https from "node:https";

const defaultCertificationBaseUrl =
  process.env.BANECO_QR_CERTIFICATION_BASE_URL ||
  process.env.BANECO_QR_BASE_URL ||
  "https://apimktdesa.baneco.com.bo/ApiGateway";
const defaultProductionBaseUrl =
  process.env.BANECO_QR_PRODUCTION_BASE_URL ||
  "https://apimkt.baneco.com.bo/ApiGateway";

export const banecoQrDefaults = {
  certificationBaseUrl: defaultCertificationBaseUrl,
  productionBaseUrl: defaultProductionBaseUrl,
  generateQrPath: "/api/qrsimple/generateQR",
  cancelQrPath: "/api/qrsimple/cancelQR",
  statusQrPath: "/api/qrsimple/statusQR",
  paidQrPath: "/api/qrsimple/paidQR",
  authenticatePath: "/api/authentication/authenticate",
  encryptPath: "/api/authentication/encrypt",
  decryptPath: "/api/authentication/decrypt",
};

const DEFAULT_TIMEOUT_MS = 8_000;
const TOKEN_TTL_MS = 25 * 60 * 1000;
const tokenCache = new Map();
const tokenPromiseCache = new Map();
const encryptedPasswordCache = new Map();
const encryptedPasswordPromiseCache = new Map();
const encryptedAccountCache = new Map();
const encryptedAccountPromiseCache = new Map();

function text(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(operation, attempts = 2) {
  let lastError;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt === attempts - 1) {
        break;
      }

      await sleep(400 * 2 ** attempt);
    }
  }

  throw lastError;
}

async function withInFlightCache(cache, key, operation) {
  const current = cache.get(key);

  if (current) {
    return current;
  }

  const promise = operation().finally(() => {
    cache.delete(key);
  });
  cache.set(key, promise);

  return promise;
}

function getBaseUrl(config = {}) {
  const configuredBaseUrl =
    typeof config.baseUrl === "string" ? config.baseUrl.trim() : "";

  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/+$/, "");
  }

  const baseUrl =
    config.environment === "certification"
      ? banecoQrDefaults.certificationBaseUrl
      : banecoQrDefaults.productionBaseUrl;

  return baseUrl.replace(/\/+$/, "");
}

function getEnvironmentLabel(config = {}) {
  return config.environment === "certification"
    ? "certificacion"
    : "produccion";
}

function getEndpoint(path, config = {}) {
  return `${getBaseUrl(config)}${path.startsWith("/") ? path : `/${path}`}`;
}

function getCacheKey(credentials, config = {}) {
  return [
    getBaseUrl(config),
    getEnvironmentLabel(config),
    credentials.apiUsername,
    credentials.accountCredit,
  ].join("|");
}

function readValue(payload, keys) {
  if (payload === null || typeof payload === "undefined") {
    return "";
  }

  if (typeof payload === "string" || typeof payload === "number") {
    return String(payload).trim();
  }

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const value = readValue(item, keys);

      if (value) {
        return value;
      }
    }

    return "";
  }

  if (typeof payload !== "object") {
    return "";
  }

  for (const key of keys) {
    const value = payload[key];

    if (typeof value === "string" || typeof value === "number") {
      return String(value).trim();
    }
  }

  for (const key of ["data", "result", "response", "body", "payload"]) {
    const value = readValue(payload[key], keys);

    if (value) {
      return value;
    }
  }

  return "";
}

async function parseResponse(response) {
  const raw = await response.text();
  const trimmed = raw.trim();

  if (!trimmed) {
    return { payload: null, raw };
  }

  try {
    return { payload: JSON.parse(trimmed), raw };
  } catch {
    return { payload: trimmed, raw };
  }
}

function getResponseMessage(payload, fallback) {
  return (
    readValue(payload, [
      "message",
      "error",
      "errorMessage",
      "description",
      "detail",
    ]) || fallback
  );
}

function getResponseCode(payload) {
  if (
    payload === null ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    return null;
  }

  const rawCode = payload.responseCode ?? payload.code ?? payload.statusCode;

  if (typeof rawCode === "number") {
    return rawCode;
  }

  if (typeof rawCode === "string" && rawCode.trim()) {
    const parsed = Number(rawCode);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function sanitizeProviderMessage(message) {
  return String(message || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function assertBanecoSuccess(payload, fallback) {
  const responseCode = getResponseCode(payload);

  if (responseCode === null || responseCode === 0) {
    return;
  }

  const error = new Error(
    sanitizeProviderMessage(getResponseMessage(payload, fallback)) || fallback,
  );
  error.stage = "provider";
  error.responseCode = responseCode;
  throw error;
}

function toSafeConnectionMessage(error) {
  if (error?.name === "AbortError") {
    return "Baneco no respondio a tiempo. Revisa la conexion o intenta nuevamente.";
  }

  if (error?.stage === "provider") {
    return `Baneco respondio: ${sanitizeProviderMessage(error.message)}. Revisa Usuario API, Password API y ambiente.`;
  }

  if (error?.stage === "encrypt") {
    return "Baneco no pudo validar el AES key enviado.";
  }

  if (error?.stage === "account") {
    return "Baneco autentico el usuario, pero no pudo validar la cuenta de abono.";
  }

  if (error?.status === 401 || error?.status === 403) {
    return "Baneco rechazo el Usuario API o Password API.";
  }

  if (error?.stage === "token") {
    return "Baneco respondio, pero no devolvio un token de autenticacion. Revisa que el ambiente coincida con estas credenciales.";
  }

  return "No se pudo conectar con Baneco. Revisa las credenciales o la URL base.";
}

async function requestBaneco(path, options = {}) {
  return requestBanecoHttp(path, options);
}

function requestBanecoHttp(path, options = {}) {
  return withRetry(
    () =>
      new Promise((resolve, reject) => {
        const url = new URL(getEndpoint(path, options.config));
        const bodyText = options.body ? JSON.stringify(options.body) : "";
        const transport = url.protocol === "http:" ? http : https;

        for (const [key, value] of Object.entries(options.query || {})) {
          url.searchParams.set(key, value);
        }

        const request = transport.request(
          url,
          {
            method: options.method || "GET",
            headers: {
              "Content-Type": "application/json",
              ...(bodyText
                ? { "Content-Length": String(Buffer.byteLength(bodyText)) }
                : {}),
              ...(options.token
                ? { Authorization: `Bearer ${options.token}` }
                : {}),
            },
          },
          (response) => {
            let text = "";

            response.setEncoding("utf8");
            response.on("data", (chunk) => {
              text += chunk;
            });
            response.on("end", () => {
              let payload = null;

              try {
                payload = text ? JSON.parse(text) : {};
              } catch {
                payload = text.trim();
              }

              if (
                !response.statusCode ||
                response.statusCode < 200 ||
                response.statusCode >= 300
              ) {
                const error = new Error(
                  getResponseMessage(
                    payload,
                    `Baneco respondio con estado HTTP ${response.statusCode}.`,
                  ),
                );
                error.status = response.statusCode;
                reject(error);
                return;
              }

              resolve({ payload, raw: text });
            });
          },
        );

        request.on("error", reject);
        request.setTimeout(options.timeoutMs || DEFAULT_TIMEOUT_MS, () => {
          const error = new Error("Baneco request timeout.");
          error.name = "AbortError";
          request.destroy(error);
        });

        if (bodyText) {
          request.write(bodyText);
        }

        request.end();
      }),
  );
}

function requestBanecoGetWithBody(path, options = {}) {
  return requestBanecoHttp(path, {
    ...options,
    method: "GET",
  });
}

function extractEncryptedValue(payload) {
  if (typeof payload === "string") {
    return payload.trim();
  }

  return readValue(payload, [
    "encryptedText",
    "encrypted",
    "encryptedData",
    "cipherText",
    "ciphertext",
    "value",
    "result",
    "text",
    "data",
  ]);
}

async function banecoEncrypt(credentials, config, value, stage = "encrypt") {
  const encryptedResponse = await requestBaneco(banecoQrDefaults.encryptPath, {
    config,
    query: {
      text: value,
      aesKey: credentials.aesKey,
    },
  });
  assertBanecoSuccess(
    encryptedResponse.payload,
    "Baneco no pudo cifrar los datos.",
  );
  const encryptedValue = extractEncryptedValue(encryptedResponse.payload);

  if (!encryptedValue) {
    const error = new Error("No encrypted value returned.");
    error.stage = stage;
    throw error;
  }

  return encryptedValue;
}

async function authenticateBaneco(credentials, config = {}) {
  const cacheKey = getCacheKey(credentials, config);
  const cachedToken = tokenCache.get(cacheKey);

  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }

  return withInFlightCache(tokenPromiseCache, cacheKey, async () => {
    const encryptedPassword = await getEncryptedPassword(credentials, config);
    const authResponse = await requestBaneco(
      banecoQrDefaults.authenticatePath,
      {
        config,
        method: "POST",
        body: {
          userName: credentials.apiUsername,
          password: encryptedPassword,
        },
      },
    );
    assertBanecoSuccess(
      authResponse.payload,
      "Baneco rechazo las credenciales.",
    );
    const token = readValue(authResponse.payload, [
      "token",
      "accessToken",
      "access_token",
      "bearerToken",
      "jwt",
    ]);

    if (!token || token.length < 12) {
      const error = new Error("No token returned.");
      error.stage = "token";
      throw error;
    }

    tokenCache.set(cacheKey, {
      token,
      expiresAt: Date.now() + TOKEN_TTL_MS,
    });

    return token;
  });
}

async function getEncryptedPassword(credentials, config = {}) {
  const storedEncryptedPassword = text(credentials.encryptedPassword);

  if (storedEncryptedPassword) {
    return storedEncryptedPassword;
  }

  const cacheKey = `${getCacheKey(credentials, config)}|${credentials.apiPassword}`;
  const cachedPassword = encryptedPasswordCache.get(cacheKey);

  if (cachedPassword) {
    return cachedPassword;
  }

  return withInFlightCache(
    encryptedPasswordPromiseCache,
    cacheKey,
    async () => {
      const encryptedPassword = await banecoEncrypt(
        credentials,
        config,
        credentials.apiPassword,
        "encrypt",
      );
      encryptedPasswordCache.set(cacheKey, encryptedPassword);

      return encryptedPassword;
    },
  );
}

async function getEncryptedAccountCredit(credentials, config = {}) {
  const storedEncryptedAccount = text(credentials.encryptedAccountCredit);

  if (storedEncryptedAccount) {
    return storedEncryptedAccount;
  }

  const cacheKey = getCacheKey(credentials, config);
  const cachedAccount = encryptedAccountCache.get(cacheKey);

  if (cachedAccount) {
    return cachedAccount;
  }

  return withInFlightCache(encryptedAccountPromiseCache, cacheKey, async () => {
    const encryptedAccount = await banecoEncrypt(
      credentials,
      config,
      credentials.accountCredit,
      "account",
    );
    encryptedAccountCache.set(cacheKey, encryptedAccount);

    return encryptedAccount;
  });
}

export async function prepareBanecoCredentials(credentials, config = {}) {
  const [encryptedPassword, encryptedAccountCredit] = await Promise.all([
    getEncryptedPassword(credentials, config),
    getEncryptedAccountCredit(credentials, config),
  ]);

  return {
    ...credentials,
    encryptedPassword,
    encryptedAccountCredit,
  };
}

export async function warmBanecoCredentials(credentials, config = {}) {
  const preparedCredentials = await prepareBanecoCredentials(
    credentials,
    config,
  );
  await authenticateBaneco(preparedCredentials, config);

  return preparedCredentials;
}

function getDueDate(days = 1) {
  const date = new Date();
  date.setDate(date.getDate() + Math.max(1, Math.min(30, Number(days) || 1)));
  return date.toISOString().slice(0, 10);
}

export async function testBanecoCredentials(credentials, config = {}) {
  const checkedAt = new Date().toISOString();
  const environmentLabel = getEnvironmentLabel(config);

  try {
    const preparedCredentials = await warmBanecoCredentials(
      credentials,
      config,
    );

    return {
      status: "online",
      message: `Conexion activa con Baneco en ${environmentLabel}.`,
      checkedAt,
      credentials: preparedCredentials,
    };
  } catch (error) {
    return {
      status: "failed",
      message: toSafeConnectionMessage(error),
      checkedAt,
    };
  }
}

export async function generateBanecoQr({
  amount,
  config = {},
  credentials,
  description,
  transactionId,
}) {
  const [token, encryptedAccount] = await Promise.all([
    authenticateBaneco(credentials, config),
    getEncryptedAccountCredit(credentials, config),
  ]);
  const response = await requestBaneco(banecoQrDefaults.generateQrPath, {
    config,
    method: "POST",
    token,
    body: {
      transactionId,
      accountCredit: encryptedAccount,
      currency: "BOB",
      amount: Math.round((Number(amount) || 0) * 100) / 100,
      description: String(description || "POS V1").slice(0, 120),
      dueDate: getDueDate(1),
      singleUse: true,
      modifyAmount: false,
    },
  });
  assertBanecoSuccess(response.payload, "Baneco rechazo la generacion del QR.");
  const qrId = readValue(response.payload, ["qrId", "qrID", "id"]);
  const qrImage = readValue(response.payload, ["qrImage", "image", "qr"]);

  if (!qrId || !qrImage) {
    const error = new Error("Baneco no devolvio la imagen del QR.");
    error.stage = "qr";
    throw error;
  }

  return {
    qrId,
    qrImage,
    responseCode: getResponseCode(response.payload),
    message: getResponseMessage(response.payload, "QR generado."),
  };
}

export async function cancelBanecoQr({ config = {}, credentials, qrId }) {
  const token = await authenticateBaneco(credentials, config);
  const response = await requestBanecoGetWithBody(
    banecoQrDefaults.cancelQrPath,
    {
      config,
      token,
      body: { qrId },
    },
  );

  assertBanecoSuccess(
    response.payload,
    "Baneco rechazo la cancelacion del QR.",
  );

  return {
    status: "cancelled",
    statusCode: 9,
    responseCode: getResponseCode(response.payload),
    message: getResponseMessage(response.payload, "QR cancelado."),
  };
}

export async function getBanecoQrStatus({ config = {}, credentials, qrId }) {
  const token = await authenticateBaneco(credentials, config);
  const response = await requestBanecoGetWithBody(
    banecoQrDefaults.statusQrPath,
    {
      config,
      token,
      body: { qrId },
    },
  );
  assertBanecoSuccess(
    response.payload,
    "Baneco rechazo la consulta del estado del QR.",
  );
  const statusCode = Number(
    readValue(response.payload, ["statusQrCode", "statusQRCode"]) || 0,
  );
  const paymentPayload = response.payload?.payment;
  const payment = Array.isArray(paymentPayload)
    ? paymentPayload
    : paymentPayload && typeof paymentPayload === "object"
      ? [paymentPayload]
      : [];

  return {
    statusCode,
    status:
      statusCode === 1 ? "paid" : statusCode === 9 ? "cancelled" : "pending",
    payment,
    message: getResponseMessage(response.payload, "Estado QR consultado."),
  };
}

export function getBanecoCredentialStatus() {
  const requiredKeys = [
    "BANECO_QR_CERTIFICATION_BASE_URL",
    "BANECO_QR_PRODUCTION_BASE_URL",
  ];
  const configuredKeys = requiredKeys.filter((key) =>
    Boolean(process.env[key]),
  );

  return {
    configured: configuredKeys.length === requiredKeys.length,
    configuredCount: configuredKeys.length,
    requiredCount: requiredKeys.length,
  };
}

export function getBanecoPublicConfig() {
  return {
    certificationBaseUrl: banecoQrDefaults.certificationBaseUrl,
    productionBaseUrl: banecoQrDefaults.productionBaseUrl,
  };
}
