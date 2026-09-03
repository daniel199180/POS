import DashboardClient from "./dashboard-client";
import { getCurrentUserContext } from "@/lib/pos/auth";
import { getPosCatalog } from "@/lib/pos/catalog";
import { getLogoSettings } from "@/lib/pos/settings";
import { listStoredPosTabSettings } from "@/lib/pos/pos-ui-settings";

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
  let posTabSettingsByBranch = {};

  const [catalogResult, settingsResult, tabsResult] = await Promise.allSettled([
    getPosCatalog(context.userAgent, context),
    getLogoSettings(context),
    listStoredPosTabSettings(context),
  ]);
  if (catalogResult.status === "fulfilled") {
    catalog = catalogResult.value;
  } else {
    catalogError =
      catalogResult.reason?.message || "No se pudo cargar el catalogo.";
  }
  if (settingsResult.status === "fulfilled") settings = settingsResult.value;
  if (tabsResult.status === "fulfilled")
    posTabSettingsByBranch = tabsResult.value;

  return (
    <DashboardClient
      user={context.user}
      catalog={catalog}
      catalogError={catalogError}
      settings={settings}
      tabSettingsByBranch={posTabSettingsByBranch}
    />
  );
}
