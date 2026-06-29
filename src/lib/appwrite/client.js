import { Account, Client, Databases, Storage } from "appwrite";
import { appwriteConfig } from "./config";

const client = new Client()
  .setEndpoint(appwriteConfig.endpoint)
  .setProject(appwriteConfig.projectId);

const account = new Account(client);
const databases = new Databases(client);
const storage = new Storage(client);

export { account, client, databases, storage };
