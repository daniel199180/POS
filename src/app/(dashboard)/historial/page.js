import { redirect } from "next/navigation";
import { getCurrentUserContext } from "@/lib/pos/auth";
import { getAdminReportOptions } from "@/lib/pos/report-data";
import { defaultReportFilters } from "@/lib/pos/report-dates";
import { getTimeZoneSettings } from "@/lib/pos/settings";
import HistoryClient from "./history-client";

export default async function HistoryPage() {
  const context = await getCurrentUserContext();
  if (!context.isAdmin) redirect("/");
  const options = await getAdminReportOptions(context);
  const { timeZone } = await getTimeZoneSettings(context);
  return (
    <HistoryClient
      options={options}
      timeZone={timeZone}
      initialFilters={{
        ...defaultReportFilters(timeZone),
        actorId: "",
        entityType: "",
        source: "changes",
        page: 1,
      }}
    />
  );
}
