import UsersManagerClient from "./users-manager-client";
import { getCurrentUserContext } from "@/lib/pos/auth";
import { listBranches } from "@/lib/pos/management";
import { listManagedUsers } from "@/lib/pos/users";

export default async function UsersPage() {
  const context = await getCurrentUserContext();

  if (!context.canManageUsers) {
    return (
      <UsersManagerClient
        branches={[]}
        initialUsers={[]}
        currentUserId={context.user.id}
        canManage={false}
      />
    );
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
    />
  );
}
