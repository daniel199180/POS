import PaymentLinksClient from "../payment-links-client";
import { getCurrentUserContext } from "@/lib/pos/auth";
import { getPosCatalog } from "@/lib/pos/catalog";

export default async function PaymentLinksPage() {
  const context = await getCurrentUserContext();
  const catalog = await getPosCatalog(context.userAgent, context);
  const branch = catalog.branches[0];

  if (!branch) {
    return (
      <div className="flex min-h-full items-center justify-center p-6 text-sm text-neutral-500">
        No tienes una sucursal disponible para consultar enlaces de pago.
      </div>
    );
  }

  return (
      <div className="flex min-h-screen flex-col overflow-hidden">
      <PaymentLinksClient
        branchId={branch.id}
        branchName={branch.name}
        showHistoryButton={false}
        branchOptions={catalog.branches}
        isAdmin={context.isAdmin}
      />
    </div>
  );
}
