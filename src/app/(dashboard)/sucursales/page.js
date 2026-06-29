import BranchesManagerClient from "./branches-manager-client";
import { getCurrentUserContext } from "@/lib/pos/auth";
import { listBranches } from "@/lib/pos/management";

export default async function BranchesPage() {
  const context = await getCurrentUserContext();
  const branches = await listBranches(context);

  return (
    <BranchesManagerClient
      initialBranches={branches}
      canManage={context.canManageCatalog}
    />
  );
}
