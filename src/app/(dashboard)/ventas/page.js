import SalesClient from "./sales-client";
import { redirect } from "next/navigation";
import { getCurrentUserContext } from "@/lib/pos/auth";
import {
  getDefaultSalesDate,
  getSalesFilterOptions,
  listSales,
} from "@/lib/pos/sales";
import { getTimeZoneSettings } from "@/lib/pos/settings";

export default async function SalesPage() {
  const context = await getCurrentUserContext();

  if (!context.isAdmin) {
    redirect("/");
  }

  const { timeZone } = await getTimeZoneSettings(context);
  const today = getDefaultSalesDate(timeZone);
  const initialFilters = {
    dateFrom: today,
    dateTo: today,
    branchId: "",
    paymentType: "",
    paymentMethodId: "",
    cashierId: "",
    status: "",
    search: "",
    page: 1,
    pageSize: 25,
  };
  const [options, initialData] = await Promise.all([
    getSalesFilterOptions(context),
    listSales(context, initialFilters),
  ]);

  return (
    <SalesClient
      canCancel={context.isAdmin}
      options={options}
      initialData={initialData}
      initialFilters={initialFilters}
      timeZone={timeZone}
    />
  );
}
