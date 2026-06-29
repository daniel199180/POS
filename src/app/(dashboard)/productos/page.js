import ProductsManagerClient from "./products-manager-client";
import { getCurrentUserContext } from "@/lib/pos/auth";
import { listBranches, listProducts } from "@/lib/pos/management";

export default async function ProductsPage() {
  const context = await getCurrentUserContext();
  const [branches, products] = await Promise.all([
    listBranches(context),
    listProducts(context),
  ]);

  return (
    <ProductsManagerClient
      branches={branches}
      initialProducts={products}
      canManage={context.canManageCatalog}
    />
  );
}
