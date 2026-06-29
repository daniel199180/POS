import DashboardShell from "./dashboard-shell";
import { getCurrentUserContext } from "@/lib/pos/auth";

export default async function DashboardLayout({ children }) {
  const context = await getCurrentUserContext();

  return (
    <DashboardShell user={context.user} profile={context.profile}>
      {children}
    </DashboardShell>
  );
}
