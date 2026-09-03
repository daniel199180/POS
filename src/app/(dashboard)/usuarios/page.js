import UsersManagerClient from "./users-manager-client";
import { redirect } from "next/navigation";
import { getCurrentUserContext } from "@/lib/pos/auth";
import { listBranches } from "@/lib/pos/management";
import { listManagedUsers } from "@/lib/pos/users";

export default async function UsersPage() {
  const context = await getCurrentUserContext();

  if (!context.canManageUsers) {
    redirect("/");
  }

  const [branches, users] = await Promise.all([
    listBranches(context),
    listManagedUsers(context),
  ]);

  return (
    <UsersManagerClient
      branches={branches.filter((branch) => branch.isActive)}
      initialUsers={users}
      currentUserId={context.user.id}
      canManage={context.canManageUsers}
      isSuperAdmin={context.isSuperAdmin}
      initialHasActiveSuperAdmin={users.some(
        (user) => user.role === "super_admin" && user.isActive,
      )}
    />
  );
}
