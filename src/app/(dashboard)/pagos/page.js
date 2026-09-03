import PaymentsManagerClient from "./payments-manager-client";
import { redirect } from "next/navigation";
import { getCurrentUserContext } from "@/lib/pos/auth";
import { listBranches } from "@/lib/pos/management";
import { listPaymentSettings } from "@/lib/pos/payments";
import { listStoredPosTabSettings } from "@/lib/pos/pos-ui-settings";

export default async function PaymentsPage() {
  const context = await getCurrentUserContext();

  if (!context.canManagePayments) {
    redirect("/");
  }

  const [branches, paymentSettings, posTabSettingsByBranch] = await Promise.all(
    [
      listBranches(context),
      listPaymentSettings(context),
      listStoredPosTabSettings(context),
    ],
  );
  const activeBranches = branches.filter((branch) => branch.isActive);

  return (
    <PaymentsManagerClient
      branches={activeBranches}
      initialMethods={paymentSettings.methods}
      baneco={paymentSettings.baneco}
      canManage={context.canManagePayments}
      initialTabSettingsByBranch={posTabSettingsByBranch}
    />
  );
}
