import ProductsManagerClient from "./products-manager-client";
import { redirect } from "next/navigation";
import { getCurrentUserContext } from "@/lib/pos/auth";
import { listStockMovements } from "@/lib/pos/inventory";
import { listBranches, listProducts } from "@/lib/pos/management";

export default async function ProductsPage() {
  const context = await getCurrentUserContext();

  if (
    !context.canManageCatalog &&
    !context.canIncreaseInventory &&
    !context.canCreateProducts
  ) {
    redirect("/");
  }

  const [branches, products, stockMovements] = await Promise.all([
    listBranches(context),
    listProducts(context),
    context.isAdmin ? listStockMovements(context) : [],
  ]);

  return (
    <ProductsManagerClient
      branches={branches}
      initialProducts={products}
      initialStockMovements={stockMovements}
      canManage={context.canManageCatalog}
      canCreateProducts={context.canCreateProducts}
      canIncreaseInventory={context.canIncreaseInventory}
      inventoryBranchIds={context.inventoryGrantBranchIds}
      isAdmin={context.isAdmin}
    />
  );
}
