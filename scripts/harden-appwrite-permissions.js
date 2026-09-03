/**
 * Audita y, con --apply, elimina permisos directos de colecciones/documentos.
 * El POS accede a Appwrite únicamente desde el backend, donde se aplican RBAC
 * y filtros por sucursal antes de usar el cliente administrativo.
 */
import dotenv from "dotenv";
import { Client, Databases, Query, Storage } from "node-appwrite";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

const apply = process.argv.includes("--apply");
const databaseId = process.env.APPWRITE_DATABASE_ID || "pos_db";
const storageBucketId =
  process.env.NEXT_PUBLIC_APPWRITE_STORAGE_BUCKET || "pos_images";
const collectionIds = [
  process.env.NEXT_PUBLIC_COL_BRANCHES || "branches",
  process.env.NEXT_PUBLIC_COL_CATEGORIES || "categories",
  process.env.NEXT_PUBLIC_COL_USER_PROFILES || "user_profiles",
  process.env.NEXT_PUBLIC_COL_BRANCH_PAYMENT_METHODS ||
    "branch_payment_methods",
  process.env.COL_BRANCH_PAYMENT_CREDENTIALS || "branch_payment_credentials",
  process.env.COL_INSTITUTE_API_SETTINGS || "institute_api_settings",
  process.env.NEXT_PUBLIC_COL_PRODUCTS || "products",
  process.env.NEXT_PUBLIC_COL_STOCK || "stock",
  process.env.NEXT_PUBLIC_COL_STOCK_MOVEMENTS || "stock_movements",
  process.env.NEXT_PUBLIC_COL_INVENTORY_GRANTS || "inventory_grants",
  process.env.NEXT_PUBLIC_COL_SALES || "sales",
  process.env.NEXT_PUBLIC_COL_SALE_ITEMS || "sale_items",
  process.env.COL_PAYMENT_LINKS || "payment_links",
  process.env.COL_AUDIT_EVENTS || "audit_events",
  process.env.COL_POS_UI_SETTINGS || "pos_ui_settings",
];

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Falta ${name}.`);
  return value;
}

const client = new Client()
  .setEndpoint(required("APPWRITE_ENDPOINT"))
  .setProject(required("APPWRITE_PROJECT_ID"))
  .setKey(required("APPWRITE_API_KEY"));
const databases = new Databases(client);
const storage = new Storage(client);

async function updateInBatches(tasks, size = 10) {
  for (let offset = 0; offset < tasks.length; offset += size) {
    await Promise.all(tasks.slice(offset, offset + size).map((task) => task()));
  }
}

let exposedCollections = 0;
let exposedDocuments = 0;
let exposedBuckets = 0;
let exposedFiles = 0;

for (const collectionId of [...new Set(collectionIds)]) {
  const collection = await databases.getCollection({
    databaseId,
    collectionId,
  });
  const collectionExposed = (collection.$permissions || []).length > 0;
  if (collectionExposed) exposedCollections += 1;

  if (apply && (collectionExposed || collection.documentSecurity !== true)) {
    await databases.updateCollection({
      databaseId,
      collectionId,
      name: collection.name,
      permissions: [],
      documentSecurity: true,
      enabled: collection.enabled !== false,
    });
  }

  let cursor = "";
  let collectionDocuments = 0;
  let collectionExposedDocuments = 0;
  do {
    const result = await databases.listDocuments({
      databaseId,
      collectionId,
      queries: [
        Query.orderAsc("$id"),
        Query.limit(100),
        ...(cursor ? [Query.cursorAfter(cursor)] : []),
      ],
    });
    collectionDocuments += result.documents.length;
    const exposed = result.documents.filter(
      (document) => (document.$permissions || []).length > 0,
    );
    collectionExposedDocuments += exposed.length;
    exposedDocuments += exposed.length;

    if (apply) {
      await updateInBatches(
        exposed.map(
          (document) => () =>
            databases.updateDocument({
              databaseId,
              collectionId,
              documentId: document.$id,
              data: {},
              permissions: [],
            }),
        ),
      );
    }

    cursor = result.documents.length === 100 ? result.documents.at(-1).$id : "";
  } while (cursor);

  console.log(
    `${collectionId}: ${collectionDocuments} documentos, ${collectionExposedDocuments} con permisos directos${collectionExposed ? ", colección expuesta" : ""}`,
  );
}

try {
  const bucket = await storage.getBucket({ bucketId: storageBucketId });
  const bucketExposed = (bucket.$permissions || []).length > 0;
  if (bucketExposed) exposedBuckets += 1;

  const files = await storage.listFiles({
    bucketId: storageBucketId,
    queries: [Query.limit(100)],
  });
  const directlyExposedFiles = files.files.filter(
    (file) => (file.$permissions || []).length > 0,
  );
  exposedFiles = directlyExposedFiles.length;

  if (apply && (bucketExposed || !bucket.fileSecurity)) {
    await storage.updateBucket({
      bucketId: storageBucketId,
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

  if (apply) {
    await updateInBatches(
      directlyExposedFiles.map(
        (file) => () =>
          storage.updateFile({
            bucketId: storageBucketId,
            fileId: file.$id,
            permissions: [],
          }),
      ),
    );
  }

  console.log(
    `${storageBucketId}: ${files.total} archivos, ${exposedFiles} con permisos directos${bucketExposed ? ", bucket expuesto" : ""}`,
  );
} catch (error) {
  if (error?.code !== 404) throw error;
  console.log(`${storageBucketId}: bucket todavía no creado`);
}

console.log(
  `${apply ? "Corregidos" : "Detectados"}: ${exposedCollections} colecciones, ${exposedDocuments} documentos, ${exposedBuckets} buckets y ${exposedFiles} archivos con acceso directo.`,
);
if (
  !apply &&
  (exposedCollections > 0 ||
    exposedDocuments > 0 ||
    exposedBuckets > 0 ||
    exposedFiles > 0)
) {
  console.log("Ejecuta de nuevo con --apply para cerrar el acceso.");
} else if (!apply) {
  console.log("No quedan permisos directos que corregir.");
}
