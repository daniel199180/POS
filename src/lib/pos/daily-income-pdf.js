const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_X = 42;
const TABLE_WIDTH = 528;
const TABLE_HEADER_HEIGHT = 20;
const MIN_ROW_HEIGHT = 22;
const PRODUCT_LINE_HEIGHT = 9;
const FOOTER_TOP_Y = 58;
const FIRST_PAGE_TABLE_TOP = 592;
const NEXT_PAGE_TABLE_TOP = 658;

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

function wrapText(value, maxLength) {
  const words = cleanText(value).split(" ").filter(Boolean);
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    if (word.length > maxLength) {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = "";
      }

      for (let index = 0; index < word.length; index += maxLength) {
        lines.push(word.slice(index, index + maxLength));
      }

      continue;
    }

    const nextLine = currentLine ? `${currentLine} ${word}` : word;

    if (nextLine.length > maxLength) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = nextLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [""];
}

function formatQuantity(value) {
  const quantity = Math.round((Number(value) || 0) * 100) / 100;

  if (Number.isInteger(quantity)) {
    return String(quantity);
  }

  return String(quantity).replace(".", ",");
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
  const y = topY - TABLE_HEADER_HEIGHT;

  addRect(lines, MARGIN_X, y, TABLE_WIDTH, TABLE_HEADER_HEIGHT, "0.9");
  addRect(lines, MARGIN_X, y, TABLE_WIDTH, TABLE_HEADER_HEIGHT);
  addText(lines, 46, y + 7, "Venta", 8);
  addText(lines, 126, y + 7, "Hora", 8);
  addText(lines, 166, y + 7, "Metodo", 8);
  addText(lines, 224, y + 7, "Productos", 8);
  addText(lines, 402, y + 7, "Total", 8);
  addText(lines, 456, y + 7, "Recibido", 8);
  addText(lines, 516, y + 7, "Cambio", 8);

  return y;
}

function saleItemSummary(sale) {
  const items = Array.isArray(sale.items) ? sale.items : [];

  if (items.length === 0) {
    return "Sin detalle de productos";
  }

  return items
    .map((item) => {
      const quantity = formatQuantity(item.quantity);
      const name = cleanText(item.productName || item.productSku || "Producto");

      return `${quantity} x ${name}`;
    })
    .join("; ");
}

function getSaleProductLines(sale) {
  return wrapText(saleItemSummary(sale), 36);
}

function getSaleRowHeight(productLines) {
  return Math.max(
    MIN_ROW_HEIGHT,
    9 + productLines.length * PRODUCT_LINE_HEIGHT,
  );
}

function addSaleRow(lines, row, rowTop) {
  const { sale, productLines, rowHeight, index } = row;
  const rowBottom = rowTop - rowHeight;
  const textTop = rowTop - 13;

  if (index % 2 === 1) {
    addRect(lines, MARGIN_X, rowBottom, TABLE_WIDTH, rowHeight, "0.98");
  }

  addLine(lines, MARGIN_X, rowBottom, 570, rowBottom);
  addText(lines, 46, textTop, truncateText(sale.saleNumber, 13), 8);
  addText(lines, 126, textTop, formatTime(sale.completedAt), 8);
  addText(lines, 166, textTop, truncateText(getPaymentLabel(sale), 10), 8);
  productLines.forEach((line, lineIndex) => {
    addText(lines, 224, textTop - lineIndex * PRODUCT_LINE_HEIGHT, line, 7);
  });
  addText(lines, 402, textTop, money(sale.total), 8);
  addText(lines, 456, textTop, money(sale.amountPaid), 8);
  addText(lines, 516, textTop, money(sale.change), 8);

  return rowBottom;
}

function getTableTop(pageIndex) {
  return pageIndex === 0 ? FIRST_PAGE_TABLE_TOP : NEXT_PAGE_TABLE_TOP;
}

function paginateSales(sales) {
  if (sales.length === 0) {
    return [[]];
  }

  const pages = [];
  let pageIndex = 0;
  let rowTop = getTableTop(pageIndex) - TABLE_HEADER_HEIGHT;
  let currentPage = [];

  sales.forEach((sale, index) => {
    const productLines = getSaleProductLines(sale);
    const rowHeight = getSaleRowHeight(productLines);

    if (currentPage.length > 0 && rowTop - rowHeight < FOOTER_TOP_Y) {
      pages.push(currentPage);
      pageIndex += 1;
      rowTop = getTableTop(pageIndex) - TABLE_HEADER_HEIGHT;
      currentPage = [];
    }

    currentPage.push({ sale, productLines, rowHeight, index });
    rowTop -= rowHeight;
  });

  if (currentPage.length > 0) {
    pages.push(currentPage);
  }

  return pages;
}

function buildPageContent(report, pageRows, pageIndex, pageCount) {
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

  let tableTop = NEXT_PAGE_TABLE_TOP;

  if (isFirstPage) {
    addSummaryBox(lines, 42, 628, 122, "Efectivo", money(paymentTotals.cash));
    addSummaryBox(lines, 174, 628, 122, "QR", money(paymentTotals.qr));
    addSummaryBox(lines, 306, 628, 122, "Total", money(summary.total));
    addSummaryBox(lines, 438, 628, 122, "Ventas", String(summary.count || 0));
    tableTop = FIRST_PAGE_TABLE_TOP;
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

  if (pageRows.length === 0) {
    addText(
      lines,
      MARGIN_X,
      rowTop - 34,
      "No hay ingresos registrados para hoy.",
      10,
    );
  } else {
    pageRows.forEach((row) => {
      rowTop = addSaleRow(lines, row, rowTop);
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
  const pages = paginateSales(sales);
  const pageContents = pages.map((pageRows, index) =>
    buildPageContent(report, pageRows, index, pages.length),
  );

  return createPdf(pageContents);
}
