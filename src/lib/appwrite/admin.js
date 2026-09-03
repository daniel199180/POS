import {
  Account,
  Client,
  Databases,
  Functions,
  Storage,
  Users,
} from "node-appwrite";
import { appwriteConfig } from "./config.js";

export const SESSION_COOKIE = appwriteConfig.sessionCookie;

export function createBaseClient() {
  return new Client()
    .setEndpoint(appwriteConfig.endpoint)
    .setProject(appwriteConfig.projectId);
}

export function createAdminClient(userAgent) {
  const apiKey =
    process.env.APPWRITE_API_KEY || process.env.APPWRITE_FUNCTION_API_KEY;

  if (!apiKey) {
    throw new Error("APPWRITE_API_KEY is required for server-side login.");
  }

  const client = createBaseClient().setKey(apiKey);

  if (userAgent) {
    client.setForwardedUserAgent(userAgent);
  }

  return {
    client,
    account: new Account(client),
    databases: new Databases(client),
    functions: new Functions(client),
    storage: new Storage(client),
    users: new Users(client),
  };
}

export function createAdminAccount(userAgent) {
  return createAdminClient(userAgent).account;
}

export function createSessionClient(sessionSecret, userAgent) {
  const client = createBaseClient().setSession(sessionSecret);

  if (userAgent) {
    client.setForwardedUserAgent(userAgent);
  }

  return {
    account: new Account(client),
    databases: new Databases(client),
    storage: new Storage(client),
  };
}

export function createSessionAccount(sessionSecret, userAgent) {
  return createSessionClient(sessionSecret, userAgent).account;
}

export function toPublicUser(user) {
  return {
    id: user.$id,
    name: user.name,
    email: user.email,
  };
}
