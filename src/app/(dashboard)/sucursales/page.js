import BranchesManagerClient from "./branches-manager-client";
import { redirect } from "next/navigation";
import { getCurrentUserContext } from "@/lib/pos/auth";
import { listBranches } from "@/lib/pos/management";

export default async function BranchesPage() {
  const context = await getCurrentUserContext();

  if (!context.canManageCatalog) {
    redirect("/");
  }

  const branches = await listBranches(context);

  return (
    <BranchesManagerClient
      initialBranches={branches}
      canManage={context.canManageCatalog}
    />
  );
}
