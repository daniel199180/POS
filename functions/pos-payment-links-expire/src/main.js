import { reconcilePendingPaymentLinks } from "../../../src/lib/pos/payment-links.js";

// Scheduled/private function: no anonymous or cashier execution permissions.
export default async ({ res, error }) => {
  try {
    const result = await reconcilePendingPaymentLinks();
    for (const failure of result.failures) error(JSON.stringify(failure));
    return res.json(result, result.failures.length ? 503 : 200);
  } catch (cause) {
    error(cause.message);
    return res.json(
      { message: "No se pudo conciliar los enlaces pendientes." },
      500,
    );
  }
};
