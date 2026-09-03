import { redirect } from "next/navigation";
import { getCurrentUserContext } from "@/lib/pos/auth";
import { getAdminReportOptions } from "@/lib/pos/report-data";
import { defaultReportFilters } from "@/lib/pos/report-dates";
import HistoryClient from "./history-client";

export default async function HistoryPage() {
  const context = await getCurrentUserContext();
  if (!context.isAdmin) redirect("/");
  const options = await getAdminReportOptions(context);
  return (
    <HistoryClient
      options={options}
      initialFilters={{
        ...defaultReportFilters(),
        actorId: "",
        entityType: "",
        source: "changes",
        page: 1,
      }}
    />
  );
}
