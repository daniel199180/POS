export const saleCategoryLabels = {
  products: "Productos",
  monthly: "Mensualidad",
  custom: "Cobro personalizado",
  mixed: "Venta mixta",
  unclassified: "Sin detalle",
};

export function saleItemCategory(item = {}) {
  const sku = String(item.productSku || "")
    .trim()
    .toUpperCase();
  const name = String(item.productName || "")
    .trim()
    .toLowerCase();
  const productId = String(item.productId || "");
  if (sku === "MENSUALIDAD" || name.startsWith("mensualidad:"))
    return "monthly";
  if (sku === "CUSTOM" || productId.startsWith("custom-")) return "custom";
  return "products";
}

export function saleCategory(items = []) {
  if (!Array.isArray(items) || items.length === 0) return "unclassified";
  const categories = new Set(items.map(saleItemCategory));
  return categories.size === 1 ? [...categories][0] : "mixed";
}

export function saleChannel(sale = {}) {
  return sale.paymentLinkId ? "paymentLink" : "pos";
}

export function getSaleOrigin(sale = {}, items = sale.items || []) {
  const category = saleCategory(items);
  const channel = saleChannel(sale);
  const channelLabel =
    channel === "paymentLink" ? "Enlace de pago" : "POS directo";
  const categoryLabel = saleCategoryLabels[category];
  return {
    category,
    categoryLabel,
    channel,
    channelLabel,
    label: `${channelLabel} · ${categoryLabel}`,
  };
}
