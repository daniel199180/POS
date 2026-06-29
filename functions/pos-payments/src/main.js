import { appwriteFunctions } from "../../../src/lib/appwrite/functions.js";
import {
  listPaymentSettings,
  testStoredBanecoCredentials,
  updateBanecoCredentials,
  updatePaymentSetting,
} from "../../../src/lib/pos/payments.js";
import {
  getFunctionRequest,
  sendError,
  sendJson,
} from "../../_shared/runtime.js";

export default async ({ req, res }) => {
  try {
    const { body, context, functionId } = await getFunctionRequest(req);

    if (functionId === appwriteFunctions.payments.list) {
      const payload = await listPaymentSettings(context, body.query || {});
      return sendJson(res, payload);
    }

    if (functionId === appwriteFunctions.payments.update) {
      const method = await updatePaymentSetting(
        context,
        body.methodId,
        body.input || {},
      );
      return sendJson(res, { method });
    }

    if (functionId === appwriteFunctions.payments.credentialsUpdate) {
      const credentials = await updateBanecoCredentials(
        context,
        body.methodId,
        body.input || {},
      );
      return sendJson(res, { credentials });
    }

    if (functionId === appwriteFunctions.banecoQr.credentialsTest) {
      const credentials = await testStoredBanecoCredentials(
        context,
        body.methodId,
      );
      return sendJson(res, { credentials });
    }

    return sendJson(res, { message: "Accion de pagos no soportada." }, 400);
  } catch (error) {
    return sendError(res, error);
  }
};
