import { redirect } from "next/navigation";
import { getCurrentUserContext } from "@/lib/pos/auth";
import { getAdminReportOptions } from "@/lib/pos/report-data";
import { defaultReportFilters } from "@/lib/pos/report-dates";
import AnalyticsClient from "./analytics-client";

export default async function AnalyticsPage() {
  const context = await getCurrentUserContext();
  if (!context.canViewAnalytics) redirect("/");
  const options = await getAdminReportOptions(context);
  return (
    <AnalyticsClient
      options={options}
      initialFilters={defaultReportFilters()}
    />
  );
}
