/**
 * Registra de forma idempotente las funciones sensibles del POS en Appwrite.
 *
 * Uso:
 *   npm run register:functions
 *
 * Requiere una API key con permisos functions.read/functions.write.
 * Tambien sube PAYMENT_CREDENTIALS_SECRET como variable secreta de Function.
 */

import dotenv from "dotenv";
import { AppwriteException, Client, Functions } from "node-appwrite";
import { appwriteFunctions } from "../src/lib/appwrite/functions.js";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

const endpoint = process.env.APPWRITE_ENDPOINT;
const projectId = process.env.APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const paymentCredentialsSecret = process.env.PAYMENT_CREDENTIALS_SECRET;
const runtime = process.env.APPWRITE_FUNCTION_RUNTIME || "node-16.0";
const banecoBaseUrl = process.env.BANECO_QR_BASE_URL;
const banecoCertificationBaseUrl =
  process.env.BANECO_QR_CERTIFICATION_BASE_URL ||
  banecoBaseUrl ||
  "https://apimktdesa.baneco.com.bo/ApiGateway";
const banecoProductionBaseUrl =
  process.env.BANECO_QR_PRODUCTION_BASE_URL ||
  "https://apimkt.baneco.com.bo/ApiGateway";

const readScopes = ["documents.read"];
const writeScopes = ["documents.read", "documents.write"];
const userWriteScopes = [
  "documents.read",
  "documents.write",
  "users.read",
  "users.write",
];

function defineFunction({
  functionId,
  name,
  entrypoint,
  timeout = 15,
  scopes = writeScopes,
  schedule = "",
  execute = ["users"],
}) {
  return {
    functionId,
    name,
    runtime,
    execute,
    events: [],
    schedule,
    timeout,
    enabled: true,
    logging: true,
    entrypoint,
    commands: "npm install",
    scopes,
  };
}

const definitions = [
  {
    ...defineFunction({
      functionId: "pos-payment-links-expire",
      name: "POS - Vencimiento de enlaces",
      entrypoint: "functions/pos-payment-links-expire/src/main.js",
      timeout: 900,
      schedule: "* * * * *",
      execute: [],
    }),
  },
  defineFunction({
    functionId: appwriteFunctions.executors.sales,
    name: "POS - Sales Executor",
    entrypoint: "functions/pos-sales/src/main.js",
    timeout: 60,
  }),
  defineFunction({
    functionId: appwriteFunctions.executors.payments,
    name: "POS - Payments Executor",
    entrypoint: "functions/pos-payments/src/main.js",
    timeout: 60,
  }),
  defineFunction({
    functionId: appwriteFunctions.executors.banecoQr,
    name: "POS - Baneco QR Executor",
    entrypoint: "functions/pos-baneco-qr/src/main.js",
    timeout: 60,
  }),
  defineFunction({
    functionId: appwriteFunctions.executors.management,
    name: "POS - Management Executor",
    entrypoint: "functions/pos-management/src/main.js",
    timeout: 60,
  }),
  defineFunction({
    functionId: appwriteFunctions.executors.users,
    name: "POS - Users Executor",
    entrypoint: "functions/pos-users/src/main.js",
    scopes: userWriteScopes,
    timeout: 60,
  }),
  defineFunction({
    functionId: appwriteFunctions.sales.list,
    name: "POS - List Sales",
    entrypoint: "functions/pos-sales/src/main.js",
    scopes: readScopes,
  }),
  defineFunction({
    functionId: appwriteFunctions.sales.create,
    name: "POS - Create Sale",
    entrypoint: "functions/pos-sales/src/main.js",
  }),
  defineFunction({
    functionId: appwriteFunctions.sales.cancel,
    name: "POS - Cancel Sale",
    entrypoint: "functions/pos-sales/src/main.js",
  }),
  defineFunction({
    functionId: appwriteFunctions.payments.list,
    name: "POS - List Payment Settings",
    entrypoint: "functions/pos-payments/src/main.js",
    scopes: readScopes,
  }),
  defineFunction({
    functionId: appwriteFunctions.payments.update,
    name: "POS - Update Payment Settings",
    entrypoint: "functions/pos-payments/src/main.js",
  }),
  defineFunction({
    functionId: appwriteFunctions.payments.credentialsUpdate,
    name: "POS - Update Baneco Credentials",
    entrypoint: "functions/pos-payments/src/main.js",
    timeout: 20,
  }),
  defineFunction({
    functionId: appwriteFunctions.banecoQr.credentialsTest,
    name: "POS - Baneco Credentials Test",
    entrypoint: "functions/pos-payments/src/main.js",
    timeout: 20,
  }),
  defineFunction({
    functionId: appwriteFunctions.banecoQr.generate,
    name: "POS - Baneco QR Generate",
    entrypoint: "functions/pos-baneco-qr/src/main.js",
    timeout: 20,
  }),
  defineFunction({
    functionId: appwriteFunctions.banecoQr.status,
    name: "POS - Baneco QR Status",
    entrypoint: "functions/pos-baneco-qr/src/main.js",
    timeout: 20,
  }),
  defineFunction({
    functionId: appwriteFunctions.banecoQr.cancel,
    name: "POS - Baneco QR Cancel",
    entrypoint: "functions/pos-baneco-qr/src/main.js",
    timeout: 20,
  }),
  defineFunction({
    functionId: appwriteFunctions.banecoQr.paid,
    name: "POS - Baneco QR Paid List",
    entrypoint: "functions/pos-baneco-qr/src/main.js",
    timeout: 20,
  }),
  defineFunction({
    functionId: appwriteFunctions.management.branchesList,
    name: "POS - List Branches",
    entrypoint: "functions/pos-management/src/main.js",
    scopes: readScopes,
  }),
  defineFunction({
    functionId: appwriteFunctions.management.branchesCreate,
    name: "POS - Create Branch",
    entrypoint: "functions/pos-management/src/main.js",
  }),
  defineFunction({
    functionId: appwriteFunctions.management.branchesUpdate,
    name: "POS - Update Branch",
    entrypoint: "functions/pos-management/src/main.js",
  }),
  defineFunction({
    functionId: appwriteFunctions.management.branchesDelete,
    name: "POS - Deactivate Branch",
    entrypoint: "functions/pos-management/src/main.js",
  }),
  defineFunction({
    functionId: appwriteFunctions.management.productsList,
    name: "POS - List Managed Products",
    entrypoint: "functions/pos-management/src/main.js",
    scopes: readScopes,
  }),
  defineFunction({
    functionId: appwriteFunctions.management.productsCreate,
    name: "POS - Create Product",
    entrypoint: "functions/pos-management/src/main.js",
  }),
  defineFunction({
    functionId: appwriteFunctions.management.productsUpdate,
    name: "POS - Update Product",
    entrypoint: "functions/pos-management/src/main.js",
  }),
  defineFunction({
    functionId: appwriteFunctions.management.productsDelete,
    name: "POS - Deactivate Product",
    entrypoint: "functions/pos-management/src/main.js",
  }),
  defineFunction({
    functionId: appwriteFunctions.management.inventoryIncrease,
    name: "POS - Increase Inventory",
    entrypoint: "functions/pos-management/src/main.js",
  }),
  defineFunction({
    functionId: appwriteFunctions.management.inventoryMovementsList,
    name: "POS - List Inventory Movements",
    entrypoint: "functions/pos-management/src/main.js",
    scopes: readScopes,
  }),
  defineFunction({
    functionId: appwriteFunctions.users.list,
    name: "POS - List Users",
    entrypoint: "functions/pos-users/src/main.js",
    scopes: ["documents.read", "users.read"],
  }),
  defineFunction({
    functionId: appwriteFunctions.users.create,
    name: "POS - Create User",
    entrypoint: "functions/pos-users/src/main.js",
    scopes: userWriteScopes,
  }),
  defineFunction({
    functionId: appwriteFunctions.users.update,
    name: "POS - Update User",
    entrypoint: "functions/pos-users/src/main.js",
    scopes: userWriteScopes,
  }),
  defineFunction({
    functionId: appwriteFunctions.users.delete,
    name: "POS - Deactivate User",
    entrypoint: "functions/pos-users/src/main.js",
    scopes: userWriteScopes,
  }),
  defineFunction({
    functionId: appwriteFunctions.users.inventoryPermissionUpdate,
    name: "POS - Update Inventory Permission",
    entrypoint: "functions/pos-users/src/main.js",
    scopes: writeScopes,
  }),
];

function requireEnv() {
  const missing = [];

  if (!endpoint) missing.push("APPWRITE_ENDPOINT");
  if (!projectId) missing.push("APPWRITE_PROJECT_ID");
  if (!apiKey) missing.push("APPWRITE_API_KEY");
  if (!paymentCredentialsSecret) missing.push("PAYMENT_CREDENTIALS_SECRET");

  if (missing.length > 0) {
    throw new Error(`Faltan variables requeridas: ${missing.join(", ")}`);
  }
}

function getFunctions() {
  const client = new Client()
    .setEndpoint(endpoint)
    .setProject(projectId)
    .setKey(apiKey);

  return new Functions(client);
}

function isNotFound(error) {
  return error instanceof AppwriteException && error.code === 404;
}

async function ensureFunction(functions, definition) {
  try {
    await functions.get({ functionId: definition.functionId });
    await functions.update(definition);
    console.log(`[update] ${definition.functionId}`);
  } catch (error) {
    if (!isNotFound(error)) {
      throw error;
    }

    await functions.create(definition);
    console.log(`[create] ${definition.functionId}`);
  }
}

function getFunctionVariables() {
  return [
    {
      key: "APPWRITE_ENDPOINT",
      value: endpoint,
      secret: false,
    },
    {
      key: "APPWRITE_PROJECT_ID",
      value: projectId,
      secret: false,
    },
    {
      key: "APPWRITE_DATABASE_ID",
      value: process.env.APPWRITE_DATABASE_ID || "pos_db",
      secret: false,
    },
    {
      key: "PAYMENT_CREDENTIALS_SECRET",
      value: paymentCredentialsSecret,
      secret: true,
    },
    {
      key: "APPWRITE_API_KEY",
      value: apiKey,
      secret: true,
    },
    ...(banecoBaseUrl
      ? [
          {
            key: "BANECO_QR_BASE_URL",
            value: banecoBaseUrl,
            secret: false,
          },
        ]
      : []),
    {
      key: "BANECO_QR_CERTIFICATION_BASE_URL",
      value: banecoCertificationBaseUrl,
      secret: false,
    },
    {
      key: "BANECO_QR_PRODUCTION_BASE_URL",
      value: banecoProductionBaseUrl,
      secret: false,
    },
  ];
}

async function ensureFunctionVariables(functions, functionId) {
  const current = await functions.listVariables({ functionId });
  const variablesByKey = new Map(
    current.variables.map((variable) => [variable.key, variable]),
  );

  for (const variable of getFunctionVariables()) {
    const existing = variablesByKey.get(variable.key);

    if (existing) {
      await functions.updateVariable({
        functionId,
        variableId: existing.$id,
        ...variable,
      });
      continue;
    }

    await functions.createVariable({
      functionId,
      ...variable,
    });
  }
}

async function main() {
  requireEnv();

  const functions = getFunctions();

  for (const definition of definitions) {
    const selected = (process.env.REGISTER_FUNCTIONS || "")
      .split(",")
      .filter(Boolean);
    if (selected.length && !selected.includes(definition.functionId)) continue;
    await ensureFunction(functions, definition);
    await ensureFunctionVariables(functions, definition.functionId);
  }

  console.log("Funciones POS registradas en Appwrite.");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
