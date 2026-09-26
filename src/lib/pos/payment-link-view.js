const payableStatuses = new Set(["open", "qr_pending", "failed"]);

export function paymentLinkDisplayStatus(link, now = Date.now()) {
  if (payableStatuses.has(link.status) && Date.parse(link.expiresAt) <= now) {
    return "expired";
  }
  return link.status;
}

export function paymentLinkSummary(links, now = Date.now()) {
  return links.reduce(
    (counts, link) => {
      const status = paymentLinkDisplayStatus(link, now);
      if (status === "expired") counts.expired++;
      else if (payableStatuses.has(status)) counts.ready++;
      return counts;
    },
    { ready: 0, expired: 0 },
  );
}

export function paymentLinkHistoryPage(links, requestedPage, pageSize = 10) {
  const pageCount = Math.max(1, Math.ceil(links.length / pageSize));
  const page = Math.min(Math.max(1, requestedPage), pageCount);
  const start = (page - 1) * pageSize;
  return { page, pageCount, start, rows: links.slice(start, start + pageSize) };
}
