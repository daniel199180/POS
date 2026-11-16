"use client";

import { useEffect, useRef, useState } from "react";
import { Printer, TriangleAlert, X } from "lucide-react";
import {
  getActiveReceiptBranchId,
  shouldAutoPrintReceipt,
} from "@/lib/pos/receipt-printing";
import {
  claimNextPaymentLinkReceipt,
  printPaymentLinkReceiptClaim,
} from "@/lib/pos/payment-link-receipt-client";

const POLL_MS = 5_000;

export default function ReceiptPrintMonitor({ defaultBranchId = "" }) {
  const [branchId, setBranchId] = useState(defaultBranchId);
  const [notice, setNotice] = useState(null);
  const inFlight = useRef(false);

  useEffect(() => {
    setBranchId(getActiveReceiptBranchId(defaultBranchId));
    const onBranchChange = (event) => {
      if (event.detail?.branchId) setBranchId(event.detail.branchId);
    };
    window.addEventListener("pos:active-receipt-branch", onBranchChange);
    return () =>
      window.removeEventListener("pos:active-receipt-branch", onBranchChange);
  }, [defaultBranchId]);

  useEffect(() => {
    if (!branchId) return undefined;
    let active = true;

    async function checkQueue() {
      if (!active || inFlight.current || !shouldAutoPrintReceipt(branchId)) {
        return;
      }
      inFlight.current = true;
      try {
        const claim = await claimNextPaymentLinkReceipt(branchId);
        if (!claim) return;
        const { result } = await printPaymentLinkReceiptClaim(claim);
        if (active) {
          setNotice({
            type: "success",
            message:
              result.mode === "browser"
                ? `Recibo ${claim.receipt.saleNumber} preparado para imprimir.`
                : `Recibo ${claim.receipt.saleNumber} enviado a ${result.printerName}.`,
          });
          window.dispatchEvent(new CustomEvent("pos:payment-link-receipt"));
        }
      } catch (error) {
        if (active) {
          setNotice({
            type: "error",
            message: `No se imprimió el recibo del enlace: ${error.message || "revisa QZ Tray y la impresora"}.`,
          });
          window.dispatchEvent(new CustomEvent("pos:payment-link-receipt"));
        }
      } finally {
        inFlight.current = false;
      }
    }

    checkQueue();
    const interval = window.setInterval(checkQueue, POLL_MS);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [branchId]);

  if (!notice) return null;
  const isError = notice.type === "error";
  const Icon = isError ? TriangleAlert : Printer;
  return (
    <div
      role={isError ? "alert" : "status"}
      className={`fixed right-4 bottom-4 z-[80] flex max-w-md items-start gap-3 rounded-lg border p-4 shadow-2xl ${
        isError
          ? "border-red-800 bg-red-950 text-red-100"
          : "border-emerald-800 bg-emerald-950 text-emerald-100"
      }`}
    >
      <Icon className="mt-0.5 size-5 shrink-0" />
      <p className="text-sm">{notice.message}</p>
      <button
        type="button"
        onClick={() => setNotice(null)}
        aria-label="Cerrar aviso de impresión"
        className="grid size-6 shrink-0 place-items-center rounded hover:bg-white/10"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
