import ProductsManagerClient from "./products-manager-client";
import { redirect } from "next/navigation";
import { getCurrentUserContext } from "@/lib/pos/auth";
import { listBranches, listProducts } from "@/lib/pos/management";

export default async function ProductsPage() {
  const context = await getCurrentUserContext();

  if (!context.canManageCatalog) {
    redirect("/");
  }

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
