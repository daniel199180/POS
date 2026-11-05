"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  MapPin,
  MessageCircle,
  Minus,
  Package,
  Plus,
  RefreshCw,
  Search,
  Share2,
  ShoppingCart,
  X,
} from "lucide-react";

const currency = new Intl.NumberFormat("es-BO", {
  style: "currency",
  currency: "BOB",
  maximumFractionDigits: 2,
});
const stockNumber = new Intl.NumberFormat("es-BO", {
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
    <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_25%_18%,#f7eaf4_0%,#f0ddec_58%,#e8d0e4_100%)]">
      {product.imageUrl && !failed ? (
        <img
          src={product.imageUrl}
          alt={product.name}
          loading="lazy"
          onError={() => setFailed(true)}
          className="size-full object-cover transition duration-500 group-hover:scale-105"
        />
      ) : (
        <div className="grid size-14 place-items-center rounded-2xl border border-white/70 bg-white/40 text-[#a46a9c] shadow-[0_12px_40px_rgba(75,28,70,0.06)] sm:size-24 sm:rounded-[2rem]">
          <Package className="size-8 stroke-[1.25] sm:size-11" />
        </div>
      )}
      <span
        className={`absolute top-2 left-2 max-w-[calc(100%-1rem)] rounded-full border px-2 py-1 text-[10px] leading-tight font-bold backdrop-blur-sm sm:top-4 sm:left-4 sm:px-3 sm:py-1.5 sm:text-[11px] ${product.stockAvailable > 0 ? "border-[#ddb9d6] bg-white/90 text-[#79276d]" : "border-[#e8c2a6] bg-[#fff5ec]/95 text-[#854c2d]"}`}
      >
        {product.stockAvailable > 0
          ? `Stock disponible: ${stockNumber.format(product.stockAvailable)}`
          : "Stock a confirmar"}
      </span>
    </div>
  );
}

function whatsappLink(number, branch, items) {
  if (!/^\d{8,15}$/.test(number || "") || !items.length) return "";
  const lines = items.map(
    ({ product, quantity }) =>
      `• ${quantity} ${unitNames[product.unit] || product.unit} × ${product.name} (${product.sku}) — ${currency.format(product.price * quantity)}`,
  );
  const total = items.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0,
  );
  const message = `Hola, quiero consultar estos productos de ${branch.name}:\n\n${lines.join("\n")}\n\nTotal referencial: ${currency.format(total)}\n\nPor favor, confirmen disponibilidad y precio. El cajero completará la compra en la sucursal.`;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

export default function CatalogClient({
  branch,
  products: initialProducts,
  categories,
  total: initialTotal,
  hasMore: initialHasMore,
}) {
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const [products, setProducts] = useState(initialProducts);
  const [total, setTotal] = useState(initialTotal);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const pageRef = useRef(1);
  const requestRef = useRef(null);
  const initialRef = useRef(true);
  const loadingRef = useRef(false);
  const sentinelRef = useRef(null);
  const cartTriggerRef = useRef(null);
  const cartCloseRef = useRef(null);
  const [logoFailed, setLogoFailed] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [order, setOrder] = useState("name");
  const [copied, setCopied] = useState(false);

  async function fetchPage(page, replace = false) {
    if (loadingRef.current && !replace) return;
    if (replace) requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    loadingRef.current = true;
    setLoading(true);
    setLoadError("");
    try {
      const params = new URLSearchParams({
        page: String(page),
        search,
        categoryId,
        sort: order,
      });
      const response = await fetch(
        `/api/public/catalog/${encodeURIComponent(branch.code)}/products?${params}`,
        { signal: controller.signal },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.message || "No se pudieron cargar los productos.",
        );
      setProducts((current) =>
        replace ? result.products : [...current, ...result.products],
      );
      setTotal(result.total);
      setHasMore(result.hasMore);
      pageRef.current = page;
    } catch (error) {
      if (error.name !== "AbortError") setLoadError(error.message);
    } finally {
      if (requestRef.current === controller) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    if (initialRef.current) {
      initialRef.current = false;
      return;
    }
    requestRef.current?.abort();
    loadingRef.current = false;
    const timer = window.setTimeout(() => {
      setProducts([]);
      setHasMore(false);
      pageRef.current = 1;
      fetchPage(1, true);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search, categoryId, order]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || loading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingRef.current)
          fetchPage(pageRef.current + 1);
      },
      { rootMargin: "500px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loading, products.length, search, categoryId, order]);

  function addToCart(product) {
    setCart((current) => {
      const existing = current.find((item) => item.product.id === product.id);
      return existing
        ? current.map((item) =>
            item.product.id === product.id
              ? { ...item, quantity: item.quantity + 1 }
              : item,
          )
        : [...current, { product, quantity: 1 }];
    });
  }

  function changeQuantity(productId, quantity) {
    const normalized = Number(quantity);
    setCart((current) =>
      normalized <= 0
        ? current.filter((item) => item.product.id !== productId)
        : current.map((item) =>
            item.product.id === productId
              ? { ...item, quantity: Math.min(999, normalized) }
              : item,
          ),
    );
  }

  const whatsappReady = /^\d{8,15}$/.test(branch.whatsappNumber || "");
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = cart.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0,
  );

  useEffect(() => {
    if (!cartOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cartCloseRef.current?.focus();
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setCartOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
      cartTriggerRef.current?.focus();
    };
  }, [cartOpen]);

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
    <main className="min-h-screen bg-[#fcf9fc] text-[#2f1830]">
      <div
        className="mx-auto max-w-7xl px-4 pb-32 sm:px-7 lg:px-10"
        inert={cartOpen ? true : undefined}
        aria-hidden={cartOpen}
      >
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#eadce8] py-5 sm:py-7">
          <div className="flex min-w-0 items-center gap-3 text-[#3c1b3a]">
            {logoFailed ? (
              <span className="grid size-12 place-items-center rounded-xl bg-[#5c1b57] text-xs font-bold text-white">
                POS
              </span>
            ) : (
              <img
                src="/api/public/catalog/logo"
                alt="Logo del POS"
                onError={() => setLogoFailed(true)}
                className="size-12 shrink-0 object-contain sm:size-14"
              />
            )}
            <div className="min-w-0">
              <p className="text-[11px] font-bold tracking-[0.18em] text-[#936f8d] uppercase">
                Catálogo
              </p>
              <p className="truncate text-sm font-semibold sm:text-base">
                {branch.name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() =>
                startRefresh(() => {
                  fetchPage(1, true);
                  router.refresh();
                })
              }
              disabled={isRefreshing}
              className="grid size-10 place-items-center rounded-full border border-[#d9c2d6] bg-white text-[#72506e] transition hover:border-[#a65395] disabled:opacity-50"
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
              className="inline-flex h-10 items-center gap-2 rounded-full border border-[#d9c2d6] bg-white px-4 text-xs font-semibold transition hover:border-[#a65395]"
              aria-label="Copiar enlace del catálogo"
            >
              {copied ? (
                <Check className="size-4 text-[#8c2f7f]" />
              ) : (
                <Share2 className="size-4" />
              )}
              {copied ? "Enlace copiado" : "Compartir"}
            </button>
          </div>
        </header>

        <section className="mt-10 border-b border-[#eadce8] pb-8 sm:mt-14 sm:pb-10">
          <p className="inline-flex items-center gap-2 text-xs font-bold tracking-[0.18em] text-[#8c2f7f] uppercase">
            <MapPin className="size-4" /> {branch.city}
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
            Catálogo de {branch.name}
          </h1>
          <p className="mt-4 text-sm text-[#7d6a7b] sm:text-base">
            {initialTotal}{" "}
            {initialTotal === 1
              ? "producto en catálogo"
              : "productos en catálogo"}
            {" · "}Precios en bolivianos
          </p>
        </section>

        <section className="mt-9" aria-labelledby="products-heading">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2
                id="products-heading"
                className="text-2xl font-semibold tracking-tight sm:text-3xl"
              >
                Productos
              </h2>
            </div>
            <span className="text-sm text-[#816e7f]">{total} resultados</span>
          </div>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <label className="relative flex-1">
              <span className="sr-only">Buscar productos</span>
              <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-[#958293]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Busca por nombre o referencia"
                className="h-12 w-full rounded-2xl border border-[#e4d4e1] bg-white pr-12 pl-12 text-sm outline-none placeholder:text-[#ac99a9] focus:border-[#a65395]"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Limpiar búsqueda"
                  className="absolute top-1/2 right-3 grid size-7 -translate-y-1/2 place-items-center rounded-full text-[#958293] hover:bg-[#f7edf5]"
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
                className="h-12 w-full appearance-none rounded-2xl border border-[#e4d4e1] bg-white px-4 pr-10 text-sm font-medium outline-none focus:border-[#a65395]"
              >
                <option value="name">Nombre A–Z</option>
                <option value="priceAsc">Precio: menor a mayor</option>
                <option value="priceDesc">Precio: mayor a menor</option>
              </select>
              <ChevronDown className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-[#8d778a]" />
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
                  className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition ${categoryId === category.id ? "bg-[#f1e0ed] text-[#722568]" : "bg-white text-[#7d6879] hover:bg-[#f5e9f2]"}`}
                >
                  {category.name}
                </button>
              ))}
            </div>
          ) : null}

          {products.length ? (
            <div className="mt-7 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
              {products.map((product) => (
                <article
                  key={product.id}
                  className="group flex flex-col overflow-hidden rounded-[1.2rem] border border-[#eadce8] bg-white shadow-[0_7px_28px_rgba(75,28,70,0.04)] transition hover:-translate-y-1 hover:shadow-[0_18px_42px_rgba(75,28,70,0.1)] sm:rounded-[1.4rem]"
                >
                  <ProductImage product={product} />
                  <div className="flex flex-1 flex-col p-3 sm:p-5">
                    <p className="truncate text-[10px] font-bold tracking-[0.08em] text-[#8c2f7f] uppercase sm:text-[11px] sm:tracking-[0.12em]">
                      {product.categoryId
                        ? product.categoryName
                        : `Ref. ${product.sku}`}
                    </p>
                    <h3 className="mt-1 line-clamp-2 min-h-10 text-sm leading-5 font-semibold tracking-tight sm:mt-2 sm:min-h-12 sm:text-lg sm:leading-6">
                      {product.name}
                    </h3>
                    <div className="mt-auto border-t border-[#f3eaf1] pt-3 sm:pt-4">
                      <p className="text-base font-bold tracking-tight text-[#4d2148] sm:text-xl">
                        {currency.format(product.price)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-[#9b8697] sm:mt-1 sm:text-xs">
                        por {unitNames[product.unit] || product.unit}
                      </p>
                    </div>
                    <div className="mt-3 grid gap-2 sm:mt-4">
                      <button
                        type="button"
                        onClick={() => addToCart(product)}
                        className="inline-flex min-h-9 items-center justify-center gap-1 rounded-xl border border-[#ba84af] px-1 text-[11px] font-semibold text-[#742669] sm:h-10 sm:gap-2 sm:text-sm"
                      >
                        <Plus className="size-3.5 sm:size-4" />
                        <span className="sm:hidden">Agregar</span>
                        <span className="hidden sm:inline">
                          Agregar al carrito
                        </span>
                      </button>
                      {whatsappReady ? (
                        <a
                          href={whatsappLink(branch.whatsappNumber, branch, [
                            { product, quantity: 1 },
                          ])}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-9 items-center justify-center gap-1 rounded-xl bg-[#8c2f7f] px-1 text-[11px] font-semibold text-white sm:h-10 sm:text-sm"
                          aria-label={`Comprar ${product.name} por WhatsApp`}
                        >
                          <MessageCircle className="size-3.5 sm:hidden" />
                          <span className="sm:hidden">WhatsApp</span>
                          <span className="hidden sm:inline">
                            Comprar por WhatsApp
                          </span>
                        </a>
                      ) : (
                        <span className="text-center text-xs text-[#9a8796]">
                          WhatsApp aún no configurado
                        </span>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : !loading ? (
            <div className="mt-7 rounded-[1.5rem] border border-[#e9d9e6] bg-white px-6 py-16 text-center">
              <Package className="mx-auto size-11 text-[#b68eaf]" />
              <h3 className="mt-5 text-lg font-semibold">
                {initialTotal
                  ? "No encontramos coincidencias"
                  : "Aún no hay productos disponibles"}
              </h3>
              <p className="mt-2 text-sm text-[#877485]">
                {initialTotal
                  ? "Prueba otra búsqueda o categoría."
                  : "Vuelve a consultar este catálogo más tarde."}
              </p>
              {initialTotal ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setCategoryId("");
                  }}
                  className="mt-5 text-sm font-semibold text-[#862b78] hover:underline"
                >
                  Limpiar filtros
                </button>
              ) : null}
            </div>
          ) : null}
          <div ref={sentinelRef} className="h-10" aria-hidden="true" />
          {loading ? (
            <p className="text-center text-sm text-[#816f7e]">
              Cargando productos…
            </p>
          ) : null}
          {loadError ? (
            <div className="text-center text-sm text-red-700">
              {loadError}{" "}
              <button
                type="button"
                onClick={() =>
                  fetchPage(
                    products.length ? pageRef.current + 1 : 1,
                    !products.length,
                  )
                }
                className="underline"
              >
                Reintentar
              </button>
            </div>
          ) : null}
        </section>

        <footer className="mt-20 flex flex-wrap items-center justify-between gap-3 border-t border-[#eadce8] pt-7 text-xs text-[#9b8897]">
          <span>Catálogo de {branch.name}</span>
          <span>El cajero confirma disponibilidad y completa la venta.</span>
        </footer>
      </div>
      {!cartOpen ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#4c1849] bg-[#5c1b57] pb-[env(safe-area-inset-bottom)] text-white shadow-[0_-14px_38px_rgba(47,24,48,0.22)]">
          <button
            ref={cartTriggerRef}
            type="button"
            onClick={() => setCartOpen(true)}
            aria-label={`Ver carrito: ${cartCount} productos, ${currency.format(cartTotal)}`}
            className="mx-auto flex min-h-20 w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-white sm:px-7"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="relative grid size-12 shrink-0 place-items-center rounded-xl bg-white/15">
                <ShoppingCart className="size-6" />
                {cartCount > 0 ? (
                  <span className="absolute -top-1.5 -right-1.5 grid min-w-5 place-items-center rounded-full bg-[#f5d7ed] px-1 text-[11px] font-bold text-[#5c1b57]">
                    {cartCount}
                  </span>
                ) : null}
              </span>
              <span className="min-w-0">
                <span className="block text-[10px] font-semibold tracking-[0.16em] text-[#ebc9e5] uppercase">
                  Total referencial
                </span>
                <span className="block truncate text-lg font-bold">
                  {currency.format(cartTotal)}
                </span>
              </span>
            </span>
            <span className="shrink-0 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#5c1b57] shadow-sm">
              Ver carrito
            </span>
          </button>
        </div>
      ) : null}
      {cartOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Carrito de ${branch.name}`}
          className="catalog-cart-open fixed inset-0 z-50 bg-[#fcf9fc] text-[#2f1830]"
        >
          <div className="mx-auto flex h-[100dvh] w-full max-w-5xl flex-col">
            <div className="flex shrink-0 items-center justify-between gap-4 border-b border-[#eadce8] bg-white px-4 py-4 sm:px-8">
              <div className="min-w-0">
                <p className="text-[11px] font-bold tracking-[0.16em] text-[#8c2f7f] uppercase">
                  {branch.name}
                </p>
                <h2 className="mt-1 text-xl font-semibold sm:text-2xl">
                  Tu carrito{" "}
                  <span className="text-base font-normal text-[#816f7e]">
                    ({cartCount})
                  </span>
                </h2>
              </div>
              <button
                ref={cartCloseRef}
                type="button"
                onClick={() => setCartOpen(false)}
                aria-label="Cerrar carrito"
                className="grid size-11 shrink-0 place-items-center rounded-full border border-[#d9c2d6] text-[#5c1b57] transition hover:bg-[#f4e9f1] focus-visible:outline-2 focus-visible:outline-[#8c2f7f]"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8">
              {cart.length ? (
                <div className="space-y-3">
                  {cart.map(({ product, quantity }) => {
                    const step = product.unit === "unit" ? 1 : 0.1;
                    return (
                      <article
                        key={product.id}
                        className="flex gap-3 rounded-2xl border border-[#eadce8] bg-white p-3 shadow-[0_6px_22px_rgba(75,28,70,0.04)] sm:gap-5 sm:p-4"
                      >
                        <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#f4e9f1] text-[#8c2f7f] sm:size-24">
                          {product.imageUrl ? (
                            <img
                              src={product.imageUrl}
                              alt=""
                              className="size-full object-cover"
                            />
                          ) : (
                            <Package className="size-8" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 leading-5 font-semibold sm:text-lg">
                            {product.name}
                          </p>
                          <p className="mt-1 text-xs text-[#816f7e]">
                            Ref. {product.sku} ·{" "}
                            {currency.format(product.price)} /{" "}
                            {unitNames[product.unit] || product.unit}
                          </p>
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center rounded-xl border border-[#d9c2d6]">
                              <button
                                type="button"
                                onClick={() =>
                                  changeQuantity(
                                    product.id,
                                    Number((quantity - step).toFixed(2)),
                                  )
                                }
                                aria-label={`Restar ${product.name}`}
                                className="grid size-9 place-items-center text-[#8c2f7f] hover:bg-[#f4e9f1]"
                              >
                                <Minus className="size-4" />
                              </button>
                              <input
                                type="number"
                                aria-label={`Cantidad de ${product.name}`}
                                min={step}
                                step={step}
                                value={quantity}
                                onChange={(event) =>
                                  changeQuantity(product.id, event.target.value)
                                }
                                className="w-12 border-x border-[#eadce8] bg-white text-center text-sm font-semibold outline-none sm:w-16"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  changeQuantity(
                                    product.id,
                                    Number((quantity + step).toFixed(2)),
                                  )
                                }
                                aria-label={`Sumar ${product.name}`}
                                className="grid size-9 place-items-center text-[#8c2f7f] hover:bg-[#f4e9f1]"
                              >
                                <Plus className="size-4" />
                              </button>
                            </div>
                            <p className="text-sm font-bold text-[#5c1b57]">
                              {currency.format(product.price * quantity)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => changeQuantity(product.id, 0)}
                            className="mt-2 text-xs font-medium text-[#8c2f7f] underline underline-offset-2"
                          >
                            Quitar
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="mx-auto grid max-w-md justify-items-center rounded-2xl border border-[#eadce8] bg-white px-6 py-14 text-center">
                  <span className="grid size-16 place-items-center rounded-2xl bg-[#f4e9f1] text-[#8c2f7f]">
                    <ShoppingCart className="size-8" />
                  </span>
                  <h3 className="mt-5 text-lg font-semibold">
                    Tu carrito está vacío
                  </h3>
                  <p className="mt-2 text-sm text-[#816f7e]">
                    Agrega productos del catálogo para consultarlos por
                    WhatsApp.
                  </p>
                  <button
                    type="button"
                    onClick={() => setCartOpen(false)}
                    className="mt-5 rounded-xl bg-[#8c2f7f] px-5 py-3 text-sm font-semibold text-white"
                  >
                    Seguir explorando
                  </button>
                </div>
              )}
            </div>
            <div className="shrink-0 border-t border-[#eadce8] bg-white px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[0_-10px_28px_rgba(47,24,48,0.07)] sm:px-8">
              <div className="flex items-center justify-between gap-3 text-lg font-semibold">
                <span>Total referencial</span>
                <span className="text-[#5c1b57]">
                  {currency.format(cartTotal)}
                </span>
              </div>
              <p className="mt-1 text-xs text-[#816f7e]">
                El cajero confirma stock y precio, y completa la venta
                manualmente.
              </p>
              {whatsappReady && cart.length ? (
                <a
                  href={whatsappLink(branch.whatsappNumber, branch, cart)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#8c2f7f] px-5 text-sm font-semibold text-white transition hover:bg-[#702368]"
                >
                  <MessageCircle className="size-5" /> Comprar por WhatsApp
                </a>
              ) : (
                <>
                  <button
                    type="button"
                    disabled
                    className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#c8a9c3] px-5 text-sm font-semibold text-white"
                  >
                    <MessageCircle className="size-5" /> Comprar por WhatsApp
                  </button>
                  {!whatsappReady ? (
                    <p className="mt-2 text-center text-xs text-[#816f7e]">
                      WhatsApp aún no configurado para esta sucursal.
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
