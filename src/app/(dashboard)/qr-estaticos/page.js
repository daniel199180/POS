import { getCurrentUserContext } from "@/lib/pos/auth";
import { getPosCatalog } from "@/lib/pos/catalog";
import { getStaticQrFilterOptions, listStaticQrs } from "@/lib/pos/static-qrs";
import StaticQrsManager from "./static-qrs-manager";

export default async function StaticQrsPage() {
  const context = await getCurrentUserContext();
  const initialFilters = {
    branchId: "",
    createdByUserId: "",
    status: "",
    page: 1,
    pageSize: 25,
  };
  const [catalog, filterOptions, initialData] = await Promise.all([
    getPosCatalog(context.userAgent, context),
    getStaticQrFilterOptions(context),
    listStaticQrs(context, initialFilters),
  ]);

  return (
    <StaticQrsManager
      initialData={initialData}
      initialFilters={initialFilters}
      branchOptions={catalog.branches}
      creatorOptions={filterOptions.creators}
    />
  );
}
