import DashboardClient from "./dashboard-client";
import { getCurrentUserContext } from "@/lib/pos/auth";
import { getPosCatalog } from "@/lib/pos/catalog";

const emptyCatalog = {
  branches: [],
  paymentMethods: [],
  productsPage: {
    products: [],
    nextOffset: 0,
    hasMore: false,
    total: 0,
  },
};

export default async function Home() {
  const context = await getCurrentUserContext();
  let catalog = emptyCatalog;
  let catalogError = "";

  try {
    catalog = await getPosCatalog(context.userAgent, context);
  } catch (error) {
    catalogError = error.message || "No se pudo cargar el catalogo.";
  }

  return (
    <DashboardClient
      user={context.user}
      catalog={catalog}
      catalogError={catalogError}
    />
  );
}
