import { appwriteFunctions } from "../../../src/lib/appwrite/functions.js";
import {
  createBranch,
  createProduct,
  deactivateBranch,
  deactivateProduct,
  listBranches,
  listProducts,
  updateBranch,
  updateProduct,
} from "../../../src/lib/pos/management.js";
import {
  getFunctionRequest,
  sendError,
  sendJson,
} from "../../_shared/runtime.js";

export default async ({ req, res }) => {
  try {
    const { body, context, functionId } = await getFunctionRequest(req);

    if (functionId === appwriteFunctions.management.branchesList) {
      const branches = await listBranches(context, body.query || {});
      return sendJson(res, { branches });
    }

    if (functionId === appwriteFunctions.management.branchesCreate) {
      const branch = await createBranch(context, body.input || {});
      return sendJson(res, { branch }, 201);
    }

    if (functionId === appwriteFunctions.management.branchesUpdate) {
      const branch = await updateBranch(
        context,
        body.branchId,
        body.input || {},
      );
      return sendJson(res, { branch });
    }

    if (functionId === appwriteFunctions.management.branchesDelete) {
      const branch = await deactivateBranch(context, body.branchId);
      return sendJson(res, { branch });
    }

    if (functionId === appwriteFunctions.management.productsList) {
      const products = await listProducts(context, body.query || {});
      return sendJson(res, { products });
    }

    if (functionId === appwriteFunctions.management.productsCreate) {
      const productId = await createProduct(context, body.input || {});
      return sendJson(res, { productId }, 201);
    }

    if (functionId === appwriteFunctions.management.productsUpdate) {
      const productId = await updateProduct(
        context,
        body.productId,
        body.input || {},
      );
      return sendJson(res, { productId });
    }

    if (functionId === appwriteFunctions.management.productsDelete) {
      const productId = await deactivateProduct(context, body.productId);
      return sendJson(res, { productId });
    }

    return sendJson(
      res,
      { message: "Accion de administracion no soportada." },
      400,
    );
  } catch (error) {
    return sendError(res, error);
  }
};
