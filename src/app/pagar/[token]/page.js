import PaymentPageClient from "./payment-page-client";

export const metadata = {
  title: "Cobro por enlace",
  description: "Detalle y pago seguro de un cobro del POS",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function PaymentPage({ params }) {
  const { token } = await params;
  return <PaymentPageClient token={token} />;
}
