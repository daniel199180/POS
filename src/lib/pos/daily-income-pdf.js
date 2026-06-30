const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_X = 42;
const FIRST_PAGE_ROWS = 22;
const NEXT_PAGE_ROWS = 31;
const ROW_HEIGHT = 18;

function cleanText(value = "") {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateText(value, maxLength) {
  const text = cleanText(value);

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(maxLength - 1, 0))}.`;
}

function money(value) {
  const amount = Math.round((Number(value) || 0) * 100) / 100;
  const sign = amount < 0 ? "-" : "";
  const [whole, decimals] = Math.abs(amount).toFixed(2).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return `Bs ${sign}${grouped},${decimals}`;
}

function formatReportDate(value = "") {
  const [year, month, day] = cleanText(value).split("-");

  if (!year || !month || !day) {
    return cleanText(value);
  }

  return `${day}/${month}/${year}`;
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("es-BO", {
    timeZone: "America/La_Paz",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function formatTime(value) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("es-BO", {
    timeZone: "America/La_Paz",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function pdfText(value) {
  const text = cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "?");

  return `<${Buffer.from(text, "ascii").toString("hex").toUpperCase()}>`;
}

function addText(lines, x, y, value, size = 10) {
  lines.push(`BT /F1 ${size} Tf ${x} ${y} Td ${pdfText(value)} Tj ET`);
}

function addLine(lines, x1, y1, x2, y2) {
  lines.push(`${x1} ${y1} m ${x2} ${y2} l S`);
}

function addRect(lines, x, y, width, height, gray = null) {
  if (gray === null) {
    lines.push(`${x} ${y} ${width} ${height} re S`);
    return;
  }

  lines.push(`${gray} g ${x} ${y} ${width} ${height} re f 0 g`);
}

function getPaymentLabel(sale) {
  if (sale.paymentMethodLabel) {
    return sale.paymentMethodLabel;
  }

  if (sale.paymentMethodType === "cash") {
    return "Efectivo";
  }

  if (sale.paymentMethodType === "qr") {
    return "QR";
  }

  return sale.paymentMethodType || "-";
}

function addSummaryBox(lines, x, y, width, label, value) {
  addRect(lines, x, y, width, 44, "0.95");
  addRect(lines, x, y, width, 44);
  addText(lines, x + 8, y + 27, label, 8);
  addText(lines, x + 8, y + 10, value, 13);
}

function addTableHeader(lines, topY) {
  const headerHeight = 20;
  const tableWidth = 528;
  const y = topY - headerHeight;

  addRect(lines, MARGIN_X, y, tableWidth, headerHeight, "0.9");
  addRect(lines, MARGIN_X, y, tableWidth, headerHeight);
  addText(lines, 46, y + 7, "Venta", 8);
  addText(lines, 137, y + 7, "Hora", 8);
  addText(lines, 188, y + 7, "Metodo", 8);
  addText(lines, 268, y + 7, "Total", 8);
  addText(lines, 344, y + 7, "Recibido", 8);
  addText(lines, 421, y + 7, "Cambio", 8);
  addText(lines, 494, y + 7, "Estado", 8);

  return y;
}

function addSaleRow(lines, sale, rowTop, index) {
  const rowBottom = rowTop - ROW_HEIGHT;

  if (index % 2 === 1) {
    addRect(lines, MARGIN_X, rowBottom, 528, ROW_HEIGHT, "0.98");
  }

  addLine(lines, MARGIN_X, rowBottom, 570, rowBottom);
  addText(lines, 46, rowBottom + 6, truncateText(sale.saleNumber, 16), 8);
  addText(lines, 137, rowBottom + 6, formatTime(sale.completedAt), 8);
  addText(
    lines,
    188,
    rowBottom + 6,
    truncateText(getPaymentLabel(sale), 13),
    8,
  );
  addText(lines, 268, rowBottom + 6, money(sale.total), 8);
  addText(lines, 344, rowBottom + 6, money(sale.amountPaid), 8);
  addText(lines, 421, rowBottom + 6, money(sale.change), 8);
  addText(lines, 494, rowBottom + 6, sale.status || "-", 8);

  return rowBottom;
}

function chunkSales(sales) {
  if (sales.length === 0) {
    return [[]];
  }

  const chunks = [];
  let cursor = 0;

  chunks.push(sales.slice(cursor, cursor + FIRST_PAGE_ROWS));
  cursor += FIRST_PAGE_ROWS;

  while (cursor < sales.length) {
    chunks.push(sales.slice(cursor, cursor + NEXT_PAGE_ROWS));
    cursor += NEXT_PAGE_ROWS;
  }

  return chunks;
}

function buildPageContent(report, pageSales, pageIndex, pageCount) {
  const lines = ["0 g", "0.75 w"];
  const isFirstPage = pageIndex === 0;
  const summary = report.summary || {};
  const paymentTotals = summary.paymentTotals || {};
  const branchName = report.branch?.name || "-";
  const cashierName = report.cashier?.name || report.cashier?.email || "-";

  addText(lines, MARGIN_X, 752, "Reporte de ingresos del dia", 18);
  addText(
    lines,
    MARGIN_X,
    731,
    `Fecha del reporte: ${formatReportDate(report.date)}`,
    10,
  );
  addText(lines, MARGIN_X, 714, `Sucursal: ${branchName}`, 10);
  addText(lines, MARGIN_X, 697, `Cajero: ${cashierName}`, 10);
  addText(
    lines,
    390,
    731,
    `Generado: ${formatDateTime(report.generatedAt)}`,
    8,
  );

  let tableTop = 658;

  if (isFirstPage) {
    addSummaryBox(lines, 42, 628, 122, "Efectivo", money(paymentTotals.cash));
    addSummaryBox(lines, 174, 628, 122, "QR", money(paymentTotals.qr));
    addSummaryBox(lines, 306, 628, 122, "Total", money(summary.total));
    addSummaryBox(lines, 438, 628, 122, "Ventas", String(summary.count || 0));
    tableTop = 592;
  }

  if (report.isLimited) {
    addText(
      lines,
      MARGIN_X,
      tableTop + 18,
      "Nota: el reporte muestra los primeros registros disponibles del dia.",
      8,
    );
  }

  let rowTop = addTableHeader(lines, tableTop);

  if (pageSales.length === 0) {
    addText(
      lines,
      MARGIN_X,
      rowTop - 34,
      "No hay ingresos registrados para hoy.",
      10,
    );
  } else {
    pageSales.forEach((sale, index) => {
      rowTop = addSaleRow(lines, sale, rowTop, index);
    });
  }

  addLine(lines, MARGIN_X, 44, 570, 44);
  addText(lines, MARGIN_X, 28, "POS - reporte listo para imprimir en carta", 8);
  addText(lines, 506, 28, `Pagina ${pageIndex + 1}/${pageCount}`, 8);

  return lines.join("\n");
}

function createPdf(pageContents) {
  const pageObjectIds = pageContents.map((_, index) => 4 + index * 2);
  const contentObjectIds = pageContents.map((_, index) => 5 + index * 2);
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageContents.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  pageContents.forEach((content, index) => {
    const contentId = contentObjectIds[index];
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    objects.push(
      `<< /Length ${Buffer.byteLength(content, "ascii")} >>\nstream\n${content}\nendstream`,
    );
  });

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets[index + 1] = Buffer.byteLength(pdf, "ascii");
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, "ascii");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";

  for (let index = 1; index <= objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, "ascii");
}

export function buildDailyIncomePdf(report) {
  const sales = Array.isArray(report.sales) ? report.sales : [];
  const chunks = chunkSales(sales);
  const pageContents = chunks.map((pageSales, index) =>
    buildPageContent(report, pageSales, index, chunks.length),
  );

  return createPdf(pageContents);
}
