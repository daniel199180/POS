import PaymentsManagerClient from "./payments-manager-client";
import { getCurrentUserContext } from "@/lib/pos/auth";
import { listBranches } from "@/lib/pos/management";
import { listPaymentSettings } from "@/lib/pos/payments";

export default async function PaymentsPage() {
  const context = await getCurrentUserContext();

  if (!context.canManagePayments) {
    return (
      <PaymentsManagerClient
        branches={[]}
        initialMethods={[]}
        baneco={null}
        canManage={false}
      />
    );
  }

  const [branches, paymentSettings] = await Promise.all([
    listBranches(context),
    listPaymentSettings(context),
  ]);

  return (
    <PaymentsManagerClient
      branches={branches.filter((branch) => branch.isActive)}
      initialMethods={paymentSettings.methods}
      baneco={paymentSettings.baneco}
      canManage={context.canManagePayments}
    />
  );
}
