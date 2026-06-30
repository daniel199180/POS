import DashboardClient from "./dashboard-client";
import { getCurrentUserContext } from "@/lib/pos/auth";
import { getPosCatalog } from "@/lib/pos/catalog";
import { getLogoSettings } from "@/lib/pos/settings";

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
  let settings = { logo: null };

  try {
    catalog = await getPosCatalog(context.userAgent, context);
  } catch (error) {
    catalogError = error.message || "No se pudo cargar el catalogo.";
  }

  try {
    settings = await getLogoSettings(context);
  } catch {
    settings = { logo: null };
  }

  return (
    <DashboardClient
      user={context.user}
      catalog={catalog}
      catalogError={catalogError}
      settings={settings}
    />
  );
}
