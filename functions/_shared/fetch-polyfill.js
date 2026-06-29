import {
  AbortController,
  Blob,
  FormData,
  Headers,
  Request,
  Response,
  fetch,
} from "node-fetch-native-with-agent/node";

const globals = {
  fetch,
  Headers,
  Request,
  Response,
  AbortController,
  Blob,
  FormData,
};

for (const [key, value] of Object.entries(globals)) {
  if (typeof globalThis[key] === "undefined") {
    globalThis[key] = value;
  }
}
