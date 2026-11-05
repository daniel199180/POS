"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  MapPin,
  Package,
  RefreshCw,
  Search,
  Share2,
  Store,
  X,
} from "lucide-react";
import { publicCatalogPath } from "@/lib/pos/public-catalog-core";

const currency = new Intl.NumberFormat("es-BO", {
  style: "currency",
  currency: "BOB",
  maximumFractionDigits: 2,
});

const unitNames = {
  unit: "unidad",
  kg: "kg",
  liter: "litro",
  meter: "metro",
};

function ProductImage({ product }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_25%_18%,#f3f5eb_0%,#e5eee7_58%,#dce8e2_100%)]">
      {product.imageUrl && !failed ? (
        <img
          src={product.imageUrl}
          alt={product.name}
          loading="lazy"
          onError={() => setFailed(true)}
          className="size-full object-cover transition duration-500 group-hover:scale-105"
        />
      ) : (
        <div className="grid size-24 place-items-center rounded-[2rem] border border-white/70 bg-white/40 text-[#7aa28f] shadow-[0_12px_40px_rgba(31,80,65,0.06)]">
          <Package className="size-11 stroke-[1.25]" />
        </div>
      )}
      <span className="absolute top-4 left-4 rounded-full border border-[#b6dcc4] bg-white/90 px-3 py-1.5 text-[11px] font-bold tracking-wide text-[#28734e] backdrop-blur-sm">
        Disponible
      </span>
    </div>
  );
}

export default function CatalogClient({
  branch,
  branches,
  products,
  categories,
}) {
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [order, setOrder] = useState("name");
  const [copied, setCopied] = useState(false);

  const visibleProducts = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es");
    const matches = products.filter(
      (product) =>
        (!categoryId || product.categoryId === categoryId) &&
        (!term ||
          `${product.name} ${product.description} ${product.sku}`
            .toLocaleLowerCase("es")
            .includes(term)),
    );
    if (order === "priceAsc")
      matches.sort(
        (a, b) => a.price - b.price || a.name.localeCompare(b.name, "es"),
      );
    if (order === "priceDesc")
      matches.sort(
        (a, b) => b.price - a.price || a.name.localeCompare(b.name, "es"),
      );
    return matches;
  }, [products, search, categoryId, order]);

  async function shareCatalog() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f7f2] text-[#172b32]">
      <div className="mx-auto max-w-7xl px-4 pb-20 sm:px-7 lg:px-10">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#dbe2df] py-5 sm:py-7">
          <Link
            href="/catalogo"
            className="flex items-center gap-3 text-[#17363e]"
          >
            <span className="grid size-10 place-items-center rounded-2xl bg-[#14343d] text-white">
              <Store className="size-5" />
            </span>
            <span className="text-sm font-bold tracking-[0.16em] uppercase">
              Catálogos
            </span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => startRefresh(() => router.refresh())}
              disabled={isRefreshing}
              className="grid size-10 place-items-center rounded-full border border-[#cedbd4] bg-white text-[#48665b] transition hover:border-[#5f987c] disabled:opacity-50"
              aria-label="Actualizar disponibilidad"
              title="Actualizar disponibilidad"
            >
              <RefreshCw
                className={`size-4 ${isRefreshing ? "animate-spin" : ""}`}
              />
            </button>
            <button
              type="button"
              onClick={shareCatalog}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-[#cedbd4] bg-white px-4 text-xs font-semibold transition hover:border-[#5f987c]"
              aria-label="Copiar enlace del catálogo"
            >
              {copied ? (
                <Check className="size-4 text-[#278b5b]" />
              ) : (
                <Share2 className="size-4" />
              )}
              {copied ? "Enlace copiado" : "Compartir"}
            </button>
            <Link
              href="/catalogo"
              className="hidden h-10 items-center gap-2 rounded-full px-3 text-xs font-semibold text-[#647875] hover:text-[#14343d] sm:inline-flex"
            >
              <ArrowLeft className="size-4" /> Todas las sucursales
            </Link>
          </div>
        </header>

        <section className="relative mt-6 overflow-hidden rounded-[2rem] bg-[#14343d] px-6 py-9 text-white sm:px-10 sm:py-11 lg:px-14 lg:py-12">
          <div
            className="absolute -top-32 -right-20 size-96 rounded-full bg-[#65aa83]/15 blur-3xl"
            aria-hidden="true"
          />
          <div
            className="absolute right-1/4 -bottom-44 size-96 rounded-full bg-[#e3c980]/10 blur-3xl"
            aria-hidden="true"
          />
          <div className="relative max-w-3xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-semibold tracking-[0.16em] uppercase">
              <span className="size-2 rounded-full bg-[#a6e2ad]" /> Catálogo en
              línea
            </p>
            <h1 className="mt-6 text-4xl leading-[1.08] font-semibold tracking-tight sm:text-5xl lg:text-6xl">
              {branch.name}
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-[#d0e0dc] sm:text-lg">
              Descubre los productos disponibles en nuestra sucursal de{" "}
              {branch.city}.
            </p>
            <p className="mt-6 inline-flex items-center gap-2 text-sm text-[#d0e0dc]">
              <MapPin className="size-4 text-[#a6d9ad]" /> {branch.city}
            </p>
          </div>
          <div className="relative mt-9 flex flex-wrap items-center gap-4 border-t border-white/15 pt-6 text-sm text-[#c7d8d3]">
            <span className="font-semibold text-white">
              {products.length}{" "}
              {products.length === 1
                ? "producto disponible"
                : "productos disponibles"}
            </span>
            <span className="hidden size-1 rounded-full bg-white/35 sm:block" />
            <span>Precios en bolivianos</span>
          </div>
        </section>

        <nav
          aria-label="Elegir sucursal"
          className="mt-7 flex gap-2 overflow-x-auto pb-2"
        >
          {branches.map((item) => (
            <Link
              key={item.id}
              href={publicCatalogPath(item.code)}
              prefetch={false}
              aria-current={item.id === branch.id ? "page" : undefined}
              className={`shrink-0 rounded-full border px-4 py-2.5 text-xs font-semibold transition sm:text-sm ${item.id === branch.id ? "border-[#14343d] bg-[#14343d] text-white" : "border-[#d8e2dd] bg-white text-[#506c63] hover:border-[#77a78c]"}`}
            >
              {item.name}
            </Link>
          ))}
        </nav>

        <section className="mt-11" aria-labelledby="products-heading">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold tracking-[0.22em] text-[#4b8a69] uppercase">
                En esta sucursal
              </p>
              <h2
                id="products-heading"
                className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl"
              >
                Productos disponibles
              </h2>
            </div>
            <span className="text-sm text-[#6e807b]">
              {visibleProducts.length} resultados
            </span>
          </div>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <label className="relative flex-1">
              <span className="sr-only">Buscar productos</span>
              <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-[#7e918a]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Busca por nombre o referencia"
                className="h-12 w-full rounded-2xl border border-[#d9e4dc] bg-white pr-12 pl-12 text-sm outline-none placeholder:text-[#9aaa9f] focus:border-[#6b9e80]"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Limpiar búsqueda"
                  className="absolute top-1/2 right-3 grid size-7 -translate-y-1/2 place-items-center rounded-full text-[#7e918a] hover:bg-[#edf3ec]"
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </label>
            <label className="relative min-w-48">
              <span className="sr-only">Ordenar productos</span>
              <select
                value={order}
                onChange={(event) => setOrder(event.target.value)}
                className="h-12 w-full appearance-none rounded-2xl border border-[#d9e4dc] bg-white px-4 pr-10 text-sm font-medium outline-none focus:border-[#6b9e80]"
              >
                <option value="name">Nombre A–Z</option>
                <option value="priceAsc">Precio: menor a mayor</option>
                <option value="priceDesc">Precio: mayor a menor</option>
              </select>
              <ChevronDown className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-[#73877f]" />
            </label>
          </div>

          {categories.length ? (
            <div
              className="mt-5 flex gap-2 overflow-x-auto pb-2"
              role="group"
              aria-label="Filtrar por categoría"
            >
              {[{ id: "", name: "Todos" }, ...categories].map((category) => (
                <button
                  key={category.id || "all"}
                  type="button"
                  onClick={() => setCategoryId(category.id)}
                  aria-pressed={categoryId === category.id}
                  className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition ${categoryId === category.id ? "bg-[#dcefe2] text-[#246747]" : "bg-white text-[#647b70] hover:bg-[#eaf2ea]"}`}
                >
                  {category.name}
                </button>
              ))}
            </div>
          ) : null}

          {visibleProducts.length ? (
            <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visibleProducts.map((product) => (
                <article
                  key={product.id}
                  className="group overflow-hidden rounded-[1.4rem] border border-[#e0e8df] bg-white shadow-[0_7px_28px_rgba(20,52,61,0.04)] transition hover:-translate-y-1 hover:shadow-[0_18px_42px_rgba(20,52,61,0.1)]"
                >
                  <ProductImage product={product} />
                  <div className="p-5">
                    <p className="text-[11px] font-bold tracking-[0.12em] text-[#569174] uppercase">
                      {product.categoryId
                        ? product.categoryName
                        : `Ref. ${product.sku}`}
                    </p>
                    <h3 className="mt-2 min-h-12 text-lg leading-6 font-semibold tracking-tight">
                      {product.name}
                    </h3>
                    {product.description ? (
                      <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-[#71847c]">
                        {product.description}
                      </p>
                    ) : (
                      <div className="min-h-10" />
                    )}
                    <div className="mt-4 border-t border-[#eef2ed] pt-4">
                      <p className="text-xl font-bold tracking-tight text-[#193e3d]">
                        {currency.format(product.price)}
                      </p>
                      <p className="mt-1 text-xs text-[#85978e]">
                        por {unitNames[product.unit] || product.unit}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-7 rounded-[1.5rem] border border-[#dce6df] bg-white px-6 py-16 text-center">
              <Package className="mx-auto size-11 text-[#a2bca9]" />
              <h3 className="mt-5 text-lg font-semibold">
                {products.length
                  ? "No encontramos coincidencias"
                  : "Aún no hay productos disponibles"}
              </h3>
              <p className="mt-2 text-sm text-[#74877c]">
                {products.length
                  ? "Prueba otra búsqueda o categoría."
                  : "Vuelve a consultar este catálogo más tarde."}
              </p>
              {products.length ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setCategoryId("");
                  }}
                  className="mt-5 text-sm font-semibold text-[#307953] hover:underline"
                >
                  Limpiar filtros
                </button>
              ) : null}
            </div>
          )}
        </section>

        <footer className="mt-20 flex flex-wrap items-center justify-between gap-3 border-t border-[#dbe2df] pt-7 text-xs text-[#879a90]">
          <span>Catálogo de {branch.name}</span>
          <span>La disponibilidad se actualiza al abrir la página.</span>
        </footer>
      </div>
    </main>
  );
}
