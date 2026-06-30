import SettingsClient from "./settings-client";
import { redirect } from "next/navigation";
import { getCurrentUserContext } from "@/lib/pos/auth";
import { getLogoSettings } from "@/lib/pos/settings";

export default async function SettingsPage() {
  const context = await getCurrentUserContext();

  if (!context.isAdmin) {
    redirect("/");
  }

  const settings = await getLogoSettings(context);

  return (
    <SettingsClient initialSettings={settings} canManage={context.isAdmin} />
  );
}
