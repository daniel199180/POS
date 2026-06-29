import { appwriteFunctions } from "../../../src/lib/appwrite/functions.js";
import {
  createManagedUser,
  deactivateManagedUser,
  listManagedUsers,
  updateManagedUser,
} from "../../../src/lib/pos/users.js";
import {
  getFunctionRequest,
  sendError,
  sendJson,
} from "../../_shared/runtime.js";

export default async ({ req, res }) => {
  try {
    const { body, context, functionId } = await getFunctionRequest(req);

    if (functionId === appwriteFunctions.users.list) {
      const users = await listManagedUsers(context, body.query || {});
      return sendJson(res, { users });
    }

    if (functionId === appwriteFunctions.users.create) {
      const user = await createManagedUser(context, body.input || {});
      return sendJson(res, { user }, 201);
    }

    if (functionId === appwriteFunctions.users.update) {
      const user = await updateManagedUser(
        context,
        body.profileId,
        body.input || {},
      );
      return sendJson(res, { user });
    }

    if (functionId === appwriteFunctions.users.delete) {
      const user = await deactivateManagedUser(context, body.profileId);
      return sendJson(res, { user });
    }

    return sendJson(res, { message: "Accion de usuarios no soportada." }, 400);
  } catch (error) {
    return sendError(res, error);
  }
};
