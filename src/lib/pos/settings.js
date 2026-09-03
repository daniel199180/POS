import { AppwriteException } from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import { cache } from "react";
import { appwriteConfig } from "../appwrite/config.js";
import { createAdminClient } from "../appwrite/admin.js";
import { ForbiddenError } from "./auth-core.js";

const LOGO_FILE_ID = "pos_logo";
const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024;
const allowedLogoTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
const allowedLogoExtensions = ["png", "jpg", "jpeg", "webp"];

function isNotFound(error) {
  return error instanceof AppwriteException && error.code === 404;
}

function inputError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function assertCanManageSettings(context) {
  if (!context.isAdmin) {
    throw new ForbiddenError(
      "Solo un administrador puede editar configuraciones.",
    );
  }
}

function sanitizeFileName(value = "logo") {
  const name = String(value)
    .trim()
    .replace(/[^a-z0-9._-]/gi, "-")
    .replace(/-+/g, "-")
    .slice(0, 90);

  return name || "logo";
}

function getLogoUrl(updatedAt = "") {
  const params = updatedAt ? `?v=${encodeURIComponent(updatedAt)}` : "";
  return `/api/pos/settings/logo${params}`;
}

function toLogoSettings(file) {
  if (!file) {
    return null;
  }

  return {
    fileId: file.$id,
    name: file.name || "logo",
    mimeType: file.mimeType || "",
    size: file.sizeOriginal || 0,
    updatedAt: file.$updatedAt || file.$createdAt || "",
    url: getLogoUrl(file.$updatedAt || file.$createdAt || ""),
  };
}

async function ensureLogoBucket(storage) {
  try {
    const bucket = await storage.getBucket({
      bucketId: appwriteConfig.storageBucket,
    });
    if ((bucket.$permissions || []).length > 0 || !bucket.fileSecurity) {
      await storage.updateBucket({
        bucketId: appwriteConfig.storageBucket,
        name: bucket.name,
        permissions: [],
        fileSecurity: true,
        enabled: bucket.enabled !== false,
        maximumFileSize: bucket.maximumFileSize,
        allowedFileExtensions: bucket.allowedFileExtensions,
        compression: bucket.compression,
        encryption: bucket.encryption,
        antivirus: bucket.antivirus,
      });
    }
    return;
  } catch (error) {
    if (!isNotFound(error)) {
      throw error;
    }
  }

  await storage.createBucket({
    bucketId: appwriteConfig.storageBucket,
    name: "POS Images",
    permissions: [],
    fileSecurity: true,
    enabled: true,
    maximumFileSize: MAX_LOGO_SIZE_BYTES,
    allowedFileExtensions: allowedLogoExtensions,
    encryption: true,
    antivirus: true,
  });
}

async function getLogoFile(storage) {
  try {
    return await storage.getFile({
      bucketId: appwriteConfig.storageBucket,
      fileId: LOGO_FILE_ID,
    });
  } catch (error) {
    if (isNotFound(error)) {
      return null;
    }

    throw error;
  }
}

const readLogoSettings = cache(async (userAgent = "") => {
  const { storage } = createAdminClient(userAgent);
  const logo = await getLogoFile(storage);

  return {
    logo: toLogoSettings(logo),
    maxLogoSize: MAX_LOGO_SIZE_BYTES,
    allowedLogoTypes: Array.from(allowedLogoTypes),
  };
});

export async function getLogoSettings(context) {
  return readLogoSettings(context.userAgent || "");
}

export async function getLogoImage(context) {
  const { storage } = createAdminClient(context.userAgent);
  const logo = await getLogoFile(storage);

  if (!logo) {
    const error = new Error("Logo no configurado.");
    error.status = 404;
    throw error;
  }

  const data = await storage.getFileView({
    bucketId: appwriteConfig.storageBucket,
    fileId: LOGO_FILE_ID,
  });

  return {
    data,
    mimeType: logo.mimeType || "image/png",
    name: logo.name || "logo",
    updatedAt: logo.$updatedAt || logo.$createdAt || "",
  };
}

export async function uploadLogo(context, file) {
  assertCanManageSettings(context);

  if (!file || typeof file.arrayBuffer !== "function") {
    throw inputError("Selecciona una imagen para el logo.");
  }

  if (!allowedLogoTypes.has(file.type)) {
    throw inputError("El logo debe ser PNG, JPG o WEBP.");
  }

  if (file.size <= 0 || file.size > MAX_LOGO_SIZE_BYTES) {
    throw inputError("El logo no puede superar 2 MB.");
  }

  const { storage } = createAdminClient(context.userAgent);
  await ensureLogoBucket(storage);

  try {
    await storage.deleteFile({
      bucketId: appwriteConfig.storageBucket,
      fileId: LOGO_FILE_ID,
    });
  } catch (error) {
    if (!isNotFound(error)) {
      throw error;
    }
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const uploaded = await storage.createFile({
    bucketId: appwriteConfig.storageBucket,
    fileId: LOGO_FILE_ID,
    file: InputFile.fromBuffer(buffer, sanitizeFileName(file.name)),
    permissions: [],
  });

  return {
    logo: toLogoSettings(uploaded),
    maxLogoSize: MAX_LOGO_SIZE_BYTES,
    allowedLogoTypes: Array.from(allowedLogoTypes),
  };
}

export async function deleteLogo(context) {
  assertCanManageSettings(context);

  const { storage } = createAdminClient(context.userAgent);

  try {
    await storage.deleteFile({
      bucketId: appwriteConfig.storageBucket,
      fileId: LOGO_FILE_ID,
    });
  } catch (error) {
    if (!isNotFound(error)) {
      throw error;
    }
  }

  return {
    logo: null,
    maxLogoSize: MAX_LOGO_SIZE_BYTES,
    allowedLogoTypes: Array.from(allowedLogoTypes),
  };
}
