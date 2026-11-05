import { ID } from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import sharp from "sharp";
import { createAdminClient } from "../appwrite/admin.js";
import { appwriteConfig } from "../appwrite/config.js";
import { ForbiddenError, canAccessBranch } from "./auth-core.js";
import { withAudit } from "./audit-writer.js";

const { databaseId, collections, storageBucket } = appwriteConfig;
const MAX_INPUT_BYTES = 12 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 220 * 1024;

function inputError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

export function canEditProductImage(context, product) {
  return Boolean(
    (context.isAdmin ||
      context.canManageCatalog ||
      context.canCreateProducts) &&
      canAccessBranch(context, product.originBranchId),
  );
}

async function getAuthorizedProduct(databases, context, productId) {
  const product = await databases.getDocument({
    databaseId,
    collectionId: collections.products,
    documentId: productId,
  });
  if (!canEditProductImage(context, product))
    throw new ForbiddenError(
      "No tienes permiso para cambiar la foto de este producto.",
    );
  return product;
}

export async function compressProductImage(file) {
  if (!file || typeof file.arrayBuffer !== "function")
    throw inputError("Selecciona una imagen.");
  if (
    !new Set([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
    ]).has(file.type)
  )
    throw inputError("La imagen debe ser JPG, PNG, WEBP o HEIC.");
  if (!file.size || file.size > MAX_INPUT_BYTES)
    throw inputError("La imagen no puede superar 12 MB.");
  const input = Buffer.from(await file.arrayBuffer());
  try {
    for (const width of [900, 760]) {
      const image = sharp(input, {
        limitInputPixels: 40000000,
        failOn: "error",
      })
        .rotate()
        .resize({
          width,
          height: width,
          fit: "inside",
          withoutEnlargement: true,
        });
      for (const quality of [72, 56, 42]) {
        const output = await image
          .clone()
          .webp({ quality, effort: 5 })
          .toBuffer();
        if (output.length <= MAX_OUTPUT_BYTES) return output;
      }
    }
    throw inputError(
      "La imagen es demasiado compleja para comprimirla. Prueba otra foto.",
    );
  } catch (error) {
    if (error.status === 400) throw error;
    throw inputError("No se pudo procesar la imagen seleccionada.");
  }
}

export async function uploadProductImage(context, productId, file) {
  const { databases, storage } = createAdminClient(context.userAgent);
  const product = await getAuthorizedProduct(databases, context, productId);
  const output = await compressProductImage(file);
  const fileId = `p_${ID.unique()}`;
  await storage.createFile({
    bucketId: storageBucket,
    fileId,
    file: InputFile.fromBuffer(output, `${productId}.webp`),
    permissions: [],
  });
  try {
    await withAudit(
      databases,
      context,
      {
        entityType: "product",
        entityId: productId,
        entityName: product.name,
        action: "product.image.update",
        before: product,
        after: { imageFileId: fileId },
        branchId: product.originBranchId,
      },
      () =>
        databases.updateDocument({
          databaseId,
          collectionId: collections.products,
          documentId: productId,
          data: { imageFileId: fileId },
        }),
    );
  } catch (error) {
    await storage
      .deleteFile({ bucketId: storageBucket, fileId })
      .catch(() => {});
    throw error;
  }
  if (product.imageFileId?.startsWith("p_")) {
    await storage
      .deleteFile({ bucketId: storageBucket, fileId: product.imageFileId })
      .catch(() => {});
  }
  return {
    imageUrl: `/api/pos/manage/products/${encodeURIComponent(productId)}/image?v=${encodeURIComponent(fileId)}`,
    imageFileId: fileId,
  };
}

export async function getManagedProductImage(context, productId) {
  const { databases, storage } = createAdminClient(context.userAgent);
  const product = await getAuthorizedProduct(databases, context, productId);
  if (!product.imageFileId) throw inputError("Este producto no tiene imagen.");
  const [data, file] = await Promise.all([
    storage.getFileView({
      bucketId: storageBucket,
      fileId: product.imageFileId,
    }),
    storage.getFile({ bucketId: storageBucket, fileId: product.imageFileId }),
  ]);
  return { data, mimeType: file.mimeType };
}
