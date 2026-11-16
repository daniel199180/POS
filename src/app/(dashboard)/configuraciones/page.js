import SettingsClient from "./settings-client";
import { redirect } from "next/navigation";
import { getCurrentUserContext } from "@/lib/pos/auth";
import { getLogoSettings, getTimeZoneSettings } from "@/lib/pos/settings";
import { getInstituteConnectionSettings } from "@/lib/pos/institute-settings";
import { getMcpSettings } from "@/lib/pos/mcp-settings";
import { listPosBranches } from "@/lib/pos/catalog";

export default async function SettingsPage() {
  const context = await getCurrentUserContext();

  if (!context.isAdmin) {
    redirect("/");
  }

  const [settings, instituteSettings, timeZoneSettings, mcpSettings, branches] =
    await Promise.all([
      getLogoSettings(context),
      getInstituteConnectionSettings(context),
      getTimeZoneSettings(context),
      context.isSuperAdmin ? getMcpSettings(context) : Promise.resolve(null),
      listPosBranches(context),
    ]);

  return (
    <SettingsClient
      initialSettings={settings}
      initialInstituteSettings={instituteSettings}
      initialTimeZone={timeZoneSettings}
      initialMcpSettings={mcpSettings}
      canManage={context.isAdmin}
      canManageMcp={context.isSuperAdmin}
      branches={branches}
    />
  );
}
