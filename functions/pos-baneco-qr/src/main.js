import { appwriteFunctions } from "../../../src/lib/appwrite/functions.js";
import {
  checkPosBanecoQrStatus,
  generatePosBanecoQr,
} from "../../../src/lib/pos/baneco-qr.js";
import {
  getFunctionRequest,
  sendError,
  sendJson,
} from "../../_shared/runtime.js";

export default async ({ req, res }) => {
  try {
    const { body, context, functionId } = await getFunctionRequest(req);

    if (functionId === appwriteFunctions.banecoQr.generate) {
      const qr = await generatePosBanecoQr(context, body.input || {});
      return sendJson(res, { qr }, 201);
    }

    if (functionId === appwriteFunctions.banecoQr.status) {
      const status = await checkPosBanecoQrStatus(context, body.input || {});
      return sendJson(res, { status });
    }

    return sendJson(res, { message: "Accion Baneco QR no soportada." }, 400);
  } catch (error) {
    return sendError(res, error);
  }
};
