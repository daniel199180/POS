export function getVisiblePaymentMethods(paymentMethods = [], branchId = "") {
  if (!branchId) {
    return paymentMethods;
  }

  return paymentMethods.filter((method) => method.branchId === branchId);
}

export function getPaymentMethodOptionLabel(
  method,
  branches = [],
  branchId = "",
) {
  if (branchId) {
    return method.label;
  }

  const branchName = branches.find(
    (branch) => branch.id === method.branchId,
  )?.name;

  return branchName ? `${method.label} · ${branchName}` : method.label;
}

export function prepareAppliedSalesFilters(filters = {}) {
  return {
    ...filters,
    page: 1,
  };
}

export function getVisibleStaticQrs(staticQrs = [], branchId = "") {
  if (!branchId) {
    return staticQrs;
  }

  return staticQrs.filter((qr) => qr.branchId === branchId);
}

export function getStaticQrOptionLabel(qr, branchId = "") {
  if (branchId || !qr.branchName) {
    return qr.description;
  }

  return `${qr.description} · ${qr.branchName}`;
}
