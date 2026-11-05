/** Adds the optional WhatsApp number to existing branch collections. */
import dotenv from "dotenv";
import { Client, Databases } from "node-appwrite";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

function required(name) {
  if (!process.env[name]) throw new Error(`Falta ${name}.`);
  return process.env[name];
}

const databaseId = required("APPWRITE_DATABASE_ID");
const collectionId = process.env.NEXT_PUBLIC_COL_BRANCHES || "branches";
const client = new Client()
  .setEndpoint(required("APPWRITE_ENDPOINT"))
  .setProject(required("APPWRITE_PROJECT_ID"))
  .setKey(required("APPWRITE_API_KEY"));
const databases = new Databases(client);
let attribute;

try {
  attribute = await databases.getAttribute({
    databaseId,
    collectionId,
    key: "whatsappNumber",
  });
} catch (error) {
  if (error.code !== 404) throw error;
  attribute = await databases.createStringAttribute({
    databaseId,
    collectionId,
    key: "whatsappNumber",
    size: 20,
    required: false,
  });
}

for (
  let attempt = 0;
  attempt < 120 && attribute.status !== "available";
  attempt++
) {
  if (attribute.status === "failed")
    throw new Error("Appwrite no pudo crear el atributo whatsappNumber.");
  await new Promise((resolve) => setTimeout(resolve, 1500));
  attribute = await databases.getAttribute({
    databaseId,
    collectionId,
    key: "whatsappNumber",
  });
}
if (attribute.status !== "available")
  throw new Error("El atributo whatsappNumber no estuvo disponible a tiempo.");
console.log("branches.whatsappNumber disponible.");
