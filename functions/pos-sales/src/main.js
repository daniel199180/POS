import { appwriteFunctions } from "../../../src/lib/appwrite/functions.js";
import {
  cancelSale,
  createSale,
  listSales,
} from "../../../src/lib/pos/sales.js";
import {
  getFunctionRequest,
  sendError,
  sendJson,
} from "../../_shared/runtime.js";

export default async ({ req, res }) => {
  try {
    const { body, context, functionId } = await getFunctionRequest(req);

    if (functionId === appwriteFunctions.sales.list) {
      const payload = await listSales(context, body.query || {});
      return sendJson(res, payload);
    }

    if (functionId === appwriteFunctions.sales.create) {
      const sale = await createSale(context, body.input || {});
      return sendJson(res, { sale }, 201);
    }

    if (functionId === appwriteFunctions.sales.cancel) {
      const sale = await cancelSale(context, body.saleId, body.input || {});
      return sendJson(res, { sale });
    }

    return sendJson(res, { message: "Accion de ventas no soportada." }, 400);
  } catch (error) {
    return sendError(res, error);
  }
};
