export const appwriteFunctions = {
  executors: {
    sales: "pos-sales",
    payments: "pos-payments",
    banecoQr: "pos-baneco-qr",
    management: "pos-management",
    users: "pos-users",
  },
  sales: {
    list: "pos-sales-list",
    create: "pos-sales-create",
    cancel: "pos-sales-cancel",
  },
  payments: {
    list: "pos-payments-list",
    update: "pos-payments-update",
    credentialsUpdate: "pos-payments-baneco-creds-update",
  },
  banecoQr: {
    credentialsTest: "pos-baneco-credentials-test",
    generate: "pos-baneco-qr-generate",
    status: "pos-baneco-qr-status",
    cancel: "pos-baneco-qr-cancel",
    paid: "pos-baneco-qr-paid",
  },
  management: {
    branchesList: "pos-management-branches-list",
    branchesCreate: "pos-management-branches-create",
    branchesUpdate: "pos-management-branches-update",
    branchesDelete: "pos-management-branches-delete",
    productsList: "pos-management-products-list",
    productsCreate: "pos-management-products-create",
    productsUpdate: "pos-management-products-update",
    productsDelete: "pos-management-products-delete",
  },
  users: {
    list: "pos-users-list",
    create: "pos-users-create",
    update: "pos-users-update",
    delete: "pos-users-delete",
  },
};

export function getPosFunctionExecutor(functionId) {
  if (functionId === appwriteFunctions.banecoQr.credentialsTest) {
    return appwriteFunctions.executors.payments;
  }

  if (Object.values(appwriteFunctions.sales).includes(functionId)) {
    return appwriteFunctions.executors.sales;
  }

  if (Object.values(appwriteFunctions.payments).includes(functionId)) {
    return appwriteFunctions.executors.payments;
  }

  if (Object.values(appwriteFunctions.banecoQr).includes(functionId)) {
    return appwriteFunctions.executors.banecoQr;
  }

  if (Object.values(appwriteFunctions.management).includes(functionId)) {
    return appwriteFunctions.executors.management;
  }

  if (Object.values(appwriteFunctions.users).includes(functionId)) {
    return appwriteFunctions.executors.users;
  }

  return functionId;
}
