import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getPublicReceipt } from "@/lib/pos/public-receipts";
import { assertRateLimit, requestFingerprint } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Consulta de recibo",
  description: "Consulta segura del estado de una venta.",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

const statusLabels = {
  completed: "Pagada",
  cancelled: "Anulada",
  refunded: "Devuelta",
};

function money(value) {
  return new Intl.NumberFormat("es-BO", {
    style: "currency",
    currency: "BOB",
  }).format(Number(value) || 0);
}

function dateTime(value) {
  return new Intl.DateTimeFormat("es-BO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/La_Paz",
  }).format(new Date(value));
}

export default async function PublicReceiptPage({ params }) {
  const [{ token }, requestHeaders] = await Promise.all([params, headers()]);
  let receipt;

  try {
    assertRateLimit({
      namespace: "public-receipt-read",
      key: requestFingerprint({ headers: requestHeaders }, token),
      limit: 60,
      windowMs: 60_000,
    });
    receipt = await getPublicReceipt(
      token,
      requestHeaders.get("user-agent") || "",
    );
  } catch (error) {
    if (error.status === 404) notFound();
    if (error.status === 429) {
      return (
        <main className="grid min-h-screen place-items-center bg-[#f7f7f2] px-5 text-[#172b32]">
          <p className="max-w-md text-center text-lg">{error.message}</p>
        </main>
      );
    }
    throw error;
  }

  const isCompleted = receipt.status === "completed";

  return (
    <main className="min-h-screen bg-[#f7f7f2] px-4 py-8 text-[#172b32] sm:px-6">
      <article className="mx-auto max-w-xl overflow-hidden rounded-3xl border border-[#dce3df] bg-white shadow-sm">
        <header className="border-b border-[#e4e9e6] px-6 py-7 text-center sm:px-9">
          <img
            src="/api/public/catalog/logo"
            alt=""
            className="mx-auto mb-4 size-16 object-contain"
          />
          <h1 className="text-2xl font-bold tracking-tight">
            {receipt.companyName || receipt.branchName}
          </h1>
          {receipt.companyName ? (
            <p className="mt-1 text-sm text-[#657574]">
              Sucursal {receipt.branchName}
            </p>
          ) : null}
          <span
            className={`mt-5 inline-flex rounded-full px-4 py-2 text-sm font-bold ${
              isCompleted
                ? "bg-emerald-100 text-emerald-800"
                : "bg-red-100 text-red-800"
            }`}
          >
            {statusLabels[receipt.status] || receipt.status}
          </span>
        </header>

        <section className="space-y-5 px-6 py-7 sm:px-9">
          <dl className="grid grid-cols-2 gap-4 rounded-2xl bg-[#f3f6f4] p-4 text-sm">
            <div>
              <dt className="text-[#657574]">Venta</dt>
              <dd className="mt-1 font-semibold break-all">
                {receipt.saleNumber}
              </dd>
            </div>
            <div>
              <dt className="text-[#657574]">Fecha</dt>
              <dd className="mt-1 font-semibold">
                {dateTime(receipt.completedAt)}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-[#657574]">Forma de pago</dt>
              <dd className="mt-1 font-semibold">{receipt.paymentLabel}</dd>
            </div>
          </dl>

          <div>
            <h2 className="text-sm font-bold tracking-wide uppercase">
              Detalle
            </h2>
            <div className="mt-3 divide-y divide-[#e4e9e6] border-y border-[#e4e9e6]">
              {receipt.items.map((item, index) => (
                <div
                  key={`${item.sku}-${index}`}
                  className="flex gap-4 py-3 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{item.name}</p>
                    {item.sku ? (
                      <p className="text-xs text-[#657574]">{item.sku}</p>
                    ) : null}
                    <p className="text-xs text-[#657574]">
                      {item.quantity} × {money(item.unitPrice)}
                    </p>
                  </div>
                  <p className="font-semibold whitespace-nowrap">
                    {money(item.subtotal)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt>Subtotal</dt>
              <dd>{money(receipt.subtotal)}</dd>
            </div>
            {receipt.discount ? (
              <div className="flex justify-between">
                <dt>Descuento</dt>
                <dd>-{money(receipt.discount)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between border-t border-[#172b32] pt-3 text-lg font-bold">
              <dt>Total</dt>
              <dd>{money(receipt.total)}</dd>
            </div>
          </dl>

          <p className="pt-2 text-center text-xs leading-5 text-[#657574]">
            Consulta informativa. Este recibo no tiene valor fiscal.
          </p>
        </section>
      </article>
    </main>
  );
}
