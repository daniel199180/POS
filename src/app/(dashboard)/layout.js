import DashboardShell from "./dashboard-shell";
import { getCurrentUserContext } from "@/lib/pos/auth";
import { getLogoSettings } from "@/lib/pos/settings";

export default async function DashboardLayout({ children }) {
  const context = await getCurrentUserContext();
  let settings = { logo: null };

  try {
    settings = await getLogoSettings(context);
  } catch {
    settings = { logo: null };
  }

  return (
    <DashboardShell
      user={context.user}
      profile={context.profile}
      settings={settings}
    >
      {children}
    </DashboardShell>
  );
}
