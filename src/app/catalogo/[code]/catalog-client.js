"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  MapPin,
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
          <div className="flex min-w-0 items-center gap-3 text-[#17363e]">
            {logoFailed ? (
              <span className="grid size-12 place-items-center rounded-xl bg-[#14343d] text-xs font-bold text-white">
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
              <p className="text-[11px] font-bold tracking-[0.18em] text-[#6b8a7a] uppercase">
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
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              aria-label={`Abrir carrito, ${cartCount} productos`}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-[#173e35] px-4 text-xs font-semibold text-white"
            >
              <ShoppingCart className="size-4" /> Carrito{" "}
              {cartCount ? `(${cartCount})` : ""}
            </button>
          </div>
        </header>

        <section className="mt-10 border-b border-[#dbe2df] pb-8 sm:mt-14 sm:pb-10">
          <p className="inline-flex items-center gap-2 text-xs font-bold tracking-[0.18em] text-[#4b8a69] uppercase">
            <MapPin className="size-4" /> {branch.city}
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
            Catálogo de {branch.name}
          </h1>
          <p className="mt-4 text-sm text-[#657574] sm:text-base">
            {initialTotal}{" "}
            {initialTotal === 1
              ? "producto disponible"
              : "productos disponibles"}
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
                Productos disponibles
              </h2>
            </div>
            <span className="text-sm text-[#6e807b]">{total} resultados</span>
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

          {products.length ? (
            <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {products.map((product) => (
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
                    <div className="mt-4 grid gap-2">
                      <button
                        type="button"
                        onClick={() => addToCart(product)}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#91b6a0] text-sm font-semibold text-[#286449]"
                      >
                        <Plus className="size-4" /> Agregar al carrito
                      </button>
                      {whatsappReady ? (
                        <a
                          href={whatsappLink(branch.whatsappNumber, branch, [
                            { product, quantity: 1 },
                          ])}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-10 items-center justify-center rounded-xl bg-[#25845a] text-sm font-semibold text-white"
                        >
                          Comprar por WhatsApp
                        </a>
                      ) : (
                        <span className="text-center text-xs text-[#8a9a90]">
                          WhatsApp aún no configurado
                        </span>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : !loading ? (
            <div className="mt-7 rounded-[1.5rem] border border-[#dce6df] bg-white px-6 py-16 text-center">
              <Package className="mx-auto size-11 text-[#a2bca9]" />
              <h3 className="mt-5 text-lg font-semibold">
                {initialTotal
                  ? "No encontramos coincidencias"
                  : "Aún no hay productos disponibles"}
              </h3>
              <p className="mt-2 text-sm text-[#74877c]">
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
                  className="mt-5 text-sm font-semibold text-[#307953] hover:underline"
                >
                  Limpiar filtros
                </button>
              ) : null}
            </div>
          ) : null}
          <div ref={sentinelRef} className="h-10" aria-hidden="true" />
          {loading ? (
            <p className="text-center text-sm text-[#71847c]">
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

        <footer className="mt-20 flex flex-wrap items-center justify-between gap-3 border-t border-[#dbe2df] pt-7 text-xs text-[#879a90]">
          <span>Catálogo de {branch.name}</span>
          <span>El cajero confirma disponibilidad y completa la venta.</span>
        </footer>
      </div>
      {cartOpen ? (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/50"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCartOpen(false);
          }}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Carrito"
            className="flex h-full w-full max-w-md flex-col bg-white p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b pb-4">
              <h2 className="text-xl font-semibold">
                Carrito de {branch.name}
              </h2>
              <button
                type="button"
                onClick={() => setCartOpen(false)}
                aria-label="Cerrar carrito"
                className="p-2"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-4">
              {cart.length ? (
                cart.map(({ product, quantity }) => (
                  <div
                    key={product.id}
                    className="flex items-start justify-between gap-3 border-b py-4"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold">{product.name}</p>
                      <p className="text-sm text-[#71847c]">
                        {currency.format(product.price)} /{" "}
                        {unitNames[product.unit] || product.unit}
                      </p>
                      <button
                        type="button"
                        onClick={() => changeQuantity(product.id, 0)}
                        className="mt-2 text-xs text-red-700"
                      >
                        Quitar
                      </button>
                    </div>
                    <label className="text-xs text-[#71847c]">
                      Cantidad
                      <input
                        type="number"
                        min={product.unit === "unit" ? "1" : "0.1"}
                        step={product.unit === "unit" ? "1" : "0.1"}
                        value={quantity}
                        onChange={(event) =>
                          changeQuantity(product.id, event.target.value)
                        }
                        className="mt-1 block h-10 w-20 rounded-md border px-2 text-base"
                      />
                    </label>
                  </div>
                ))
              ) : (
                <p className="py-12 text-center text-sm text-[#71847c]">
                  Tu carrito está vacío.
                </p>
              )}
            </div>
            <div className="border-t pt-4">
              <p className="flex justify-between text-lg font-semibold">
                <span>Total referencial</span>
                <span>
                  {currency.format(
                    cart.reduce(
                      (sum, item) => sum + item.product.price * item.quantity,
                      0,
                    ),
                  )}
                </span>
              </p>
              <p className="mt-2 text-xs text-[#71847c]">
                El cajero confirmará el stock y realizará la venta manualmente.
              </p>
              {whatsappReady && cart.length ? (
                <a
                  href={whatsappLink(branch.whatsappNumber, branch, cart)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 flex h-12 items-center justify-center rounded-xl bg-[#25845a] font-semibold text-white"
                >
                  Comprar carrito por WhatsApp
                </a>
              ) : (
                <p className="mt-4 rounded-xl bg-[#eef3ee] p-3 text-center text-sm text-[#687e70]">
                  {whatsappReady
                    ? "Agrega productos para continuar."
                    : "WhatsApp aún no configurado para esta sucursal."}
                </p>
              )}
            </div>
          </aside>
        </div>
      ) : null}
    </main>
  );
}
