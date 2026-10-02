import { getCurrentUserContext } from "@/lib/pos/auth";
import { getPosCatalog } from "@/lib/pos/catalog";
import {
  getStaticQrFilterOptions,
  listStaticQrPayments,
  listStaticQrs,
} from "@/lib/pos/static-qrs";
import StaticQrsManager from "./static-qrs-manager";

export default async function StaticQrsPage() {
  const context = await getCurrentUserContext();
  const initialFilters = {
    branchId: "",
    createdByUserId: "",
    status: "",
    archived: "false",
    page: 1,
    pageSize: 25,
  };
  const initialPaymentFilters = {
    branchId: "",
    staticQrId: "",
    page: 1,
    pageSize: 15,
  };
  const [catalog, filterOptions, initialData, initialPaymentData] =
    await Promise.all([
      getPosCatalog(context.userAgent, context),
      getStaticQrFilterOptions(context),
      listStaticQrs(context, initialFilters),
      listStaticQrPayments(context, initialPaymentFilters),
    ]);

  return (
    <StaticQrsManager
      initialData={initialData}
      initialFilters={initialFilters}
      branchOptions={catalog.branches}
      creatorOptions={filterOptions.creators}
      qrOptions={filterOptions.qrs}
      initialPaymentData={initialPaymentData}
      initialPaymentFilters={initialPaymentFilters}
    />
  );
}
