import Link from "next/link";
import { ArrowRight, MapPin, Store } from "lucide-react";
import { listPublicCatalogBranches } from "@/lib/pos/public-catalog";
import { publicCatalogPath } from "@/lib/pos/public-catalog-core";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Catálogos por sucursal | POS",
  description: "Consulta los productos disponibles en cada sucursal.",
};

export default async function CatalogIndexPage() {
  const branches = await listPublicCatalogBranches();

  return (
    <main className="min-h-screen bg-[#f7f7f2] text-[#172b32]">
      <div className="mx-auto max-w-6xl px-5 pt-8 pb-20 sm:px-8 sm:pt-12">
        <header className="flex items-center justify-between border-b border-[#dbe2df] pb-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-2xl bg-[#14343d] text-white">
              <Store className="size-5" />
            </span>
            <span className="text-sm font-bold tracking-[0.16em] uppercase">
              Catálogos
            </span>
          </div>
          <span className="text-xs font-medium text-[#6b7c7b]">
            Productos por sucursal
          </span>
        </header>

        <section className="max-w-3xl pt-16 pb-12 sm:pt-24">
          <p className="text-xs font-bold tracking-[0.24em] text-[#42816c] uppercase">
            Explora nuestras sucursales
          </p>
          <h1 className="mt-5 text-4xl leading-tight font-semibold tracking-tight sm:text-6xl">
            Encuentra lo que necesitas, cerca de ti.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-[#657574] sm:text-lg">
            Elige una sucursal para ver los productos que tiene disponibles en
            este momento.
          </p>
        </section>

        {branches.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {branches.map((branch, index) => (
              <Link
                key={branch.id}
                href={publicCatalogPath(branch.code)}
                className="group flex min-h-64 flex-col justify-between rounded-[1.7rem] border border-[#dce6e1] bg-white p-7 shadow-[0_12px_36px_rgba(22,57,59,0.04)] transition hover:-translate-y-1 hover:border-[#7ba997] hover:shadow-[0_22px_50px_rgba(22,57,59,0.09)]"
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="grid size-12 place-items-center rounded-2xl bg-[#eaf4ee] text-[#397960]">
                    <Store className="size-5" />
                  </span>
                  <span className="text-xs font-semibold tracking-[0.18em] text-[#a2b4ac] uppercase">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
                <div>
                  <p className="mb-2 flex items-center gap-1.5 text-sm text-[#6a7d79]">
                    <MapPin className="size-3.5" /> {branch.city}
                  </p>
                  <h2 className="text-2xl font-semibold tracking-tight">
                    {branch.name}
                  </h2>
                  <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#30785b] group-hover:gap-3">
                    Ver productos <ArrowRight className="size-4" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-3xl border border-[#dce6e1] bg-white p-10 text-center text-[#657574]">
            No hay catálogos disponibles por ahora.
          </div>
        )}
      </div>
    </main>
  );
}
