import { notFound } from "next/navigation";
import { cache } from "react";
import { getPublicCatalog } from "@/lib/pos/public-catalog";
import CatalogClient from "./catalog-client";

export const dynamic = "force-dynamic";

const loadCatalog = cache(getPublicCatalog);

export async function generateMetadata({ params }) {
  const { code } = await params;
  try {
    const { branch } = await loadCatalog(code);
    return {
      title: `Catálogo de ${branch.name} | POS`,
      description: `Consulta productos y stock de ${branch.name}, ${branch.city}.`,
    };
  } catch (error) {
    if (error.status === 404) {
      return { title: "Catálogo no disponible", robots: { index: false } };
    }
    throw error;
  }
}

export default async function BranchCatalogPage({ params }) {
  const { code } = await params;
  let catalog;
  try {
    catalog = await loadCatalog(code);
  } catch (error) {
    if (error.status === 404) notFound();
    throw error;
  }
  return <CatalogClient {...catalog} />;
}
