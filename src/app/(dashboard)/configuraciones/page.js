import SettingsClient from "./settings-client";
import { redirect } from "next/navigation";
import { getCurrentUserContext } from "@/lib/pos/auth";
import { getLogoSettings, getTimeZoneSettings } from "@/lib/pos/settings";
import { getInstituteConnectionSettings } from "@/lib/pos/institute-settings";

export default async function SettingsPage() {
  const context = await getCurrentUserContext();

  if (!context.isAdmin) {
    redirect("/");
  }

  const [settings, instituteSettings, timeZoneSettings] = await Promise.all([
    getLogoSettings(context),
    getInstituteConnectionSettings(context),
    getTimeZoneSettings(context),
  ]);

  return (
    <SettingsClient
      initialSettings={settings}
      initialInstituteSettings={instituteSettings}
      initialTimeZone={timeZoneSettings}
      canManage={context.isAdmin}
    />
  );
}
