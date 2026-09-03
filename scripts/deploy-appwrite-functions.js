/**
 * Despliega el codigo de las Functions ejecutoras del POS en Appwrite.
 *
 * Uso:
 *   npm run deploy:functions
 *
 * Requiere APPWRITE_API_KEY con permisos functions.read/functions.write.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import dotenv from "dotenv";
import { Client, Functions } from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import { appwriteFunctions } from "../src/lib/appwrite/functions.js";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

const endpoint = process.env.APPWRITE_ENDPOINT;
const projectId = process.env.APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;

const allDeployments = [
  {
    functionId: "pos-payment-links-expire",
    entrypoint: "functions/pos-payment-links-expire/src/main.js",
  },
  {
    functionId: appwriteFunctions.executors.sales,
    entrypoint: "functions/pos-sales/src/main.js",
  },
  {
    functionId: appwriteFunctions.executors.payments,
    entrypoint: "functions/pos-payments/src/main.js",
  },
  {
    functionId: appwriteFunctions.executors.banecoQr,
    entrypoint: "functions/pos-baneco-qr/src/main.js",
  },
  {
    functionId: appwriteFunctions.executors.management,
    entrypoint: "functions/pos-management/src/main.js",
  },
  {
    functionId: appwriteFunctions.executors.users,
    entrypoint: "functions/pos-users/src/main.js",
  },
];
const selectedFunctionIds = new Set(
  (process.env.DEPLOY_FUNCTIONS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
const deployments =
  selectedFunctionIds.size > 0
    ? allDeployments.filter((deployment) =>
        selectedFunctionIds.has(deployment.functionId),
      )
    : allDeployments;

function requireEnv() {
  const missing = [];

  if (!endpoint) missing.push("APPWRITE_ENDPOINT");
  if (!projectId) missing.push("APPWRITE_PROJECT_ID");
  if (!apiKey) missing.push("APPWRITE_API_KEY");

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

function createArchive() {
  const tempDir = mkdtempSync(path.join(tmpdir(), "pos-functions-"));
  const archivePath = path.join(tempDir, "pos-functions.tar.gz");
  const result = spawnSync(
    "tar",
    [
      "-czf",
      archivePath,
      "package.json",
      "package-lock.json",
      "src/lib",
      "functions",
    ],
    {
      cwd: process.cwd(),
      stdio: "inherit",
    },
  );

  if (result.status !== 0) {
    throw new Error("No se pudo crear el paquete tar.gz de Functions.");
  }

  return archivePath;
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function withRetries(label, task, attempts = 5) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;

      if (attempt === attempts) {
        break;
      }

      console.warn(
        `[retry] ${label} intento ${attempt}/${attempts}: ${error.message || error}`,
      );
      await wait(3000 * attempt);
    }
  }

  throw lastError;
}

async function waitForDeployment(functions, functionId, deploymentId) {
  const finalStatuses = new Set(["ready", "failed"]);

  for (let attempt = 0; attempt < 90; attempt += 1) {
    const deployment = await withRetries(`status ${functionId}`, () =>
      functions.getDeployment({
        functionId,
        deploymentId,
      }),
    );

    if (finalStatuses.has(deployment.status)) {
      if (deployment.status === "failed") {
        throw new Error(
          `Deployment ${deploymentId} fallo para ${functionId}:\n${deployment.buildLogs || "Sin logs."}`,
        );
      }

      return deployment;
    }

    await wait(2000);
  }

  throw new Error(`Timeout esperando deployment de ${functionId}.`);
}

async function main() {
  requireEnv();

  const archivePath = createArchive();
  const functions = getFunctions();

  for (const deploymentConfig of deployments) {
    const code = InputFile.fromPath(archivePath, "pos-functions.tar.gz");
    const deployment = await withRetries(
      `deploy ${deploymentConfig.functionId}`,
      () =>
        functions.createDeployment({
          functionId: deploymentConfig.functionId,
          code,
          activate: true,
          entrypoint: deploymentConfig.entrypoint,
          commands: "npm install",
        }),
    );

    console.log(`[deploy] ${deploymentConfig.functionId} -> ${deployment.$id}`);
    await waitForDeployment(
      functions,
      deploymentConfig.functionId,
      deployment.$id,
    );
    console.log(`[ready] ${deploymentConfig.functionId}`);
  }

  console.log("Functions POS desplegadas y activas.");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
