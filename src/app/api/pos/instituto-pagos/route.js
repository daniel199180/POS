import { NextResponse } from "next/server";
import {
  ForbiddenError,
  canAccessBranch,
  getApiErrorResponse,
  getCurrentUserContext,
} from "@/lib/pos/auth";
import { createAdminClient } from "@/lib/appwrite/admin";
import { appwriteConfig } from "@/lib/appwrite/config";
import { requestInstitutePayments } from "@/lib/pos/institute-payments";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBranchName(value) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function inputError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function assertPaymentBelongsToBranch(context, payload) {
  const branchId = text(payload.branchId) || text(context.profile?.branchId);
  const ci = text(payload.ci);
  const paymentId = text(payload.paymentId);

  if (!branchId) {
    throw inputError("Selecciona una sucursal para cobrar la mensualidad.");
  }

  if (!ci || !paymentId) {
    throw inputError("La mensualidad seleccionada es inválida.");
  }

  if (!canAccessBranch(context, branchId)) {
    throw new ForbiddenError("No tienes acceso a esta sucursal.");
  }

  const { databases } = createAdminClient(context.userAgent);
  const branch = await databases.getDocument({
    databaseId: appwriteConfig.databaseId,
    collectionId: appwriteConfig.collections.branches,
    documentId: branchId,
  });
  const ledgerResult = await requestInstitutePayments(
    `?ci=${encodeURIComponent(ci)}`,
    { method: "GET" },
  );

  if (ledgerResult.status < 200 || ledgerResult.status >= 300) {
    throw inputError(
      ledgerResult.body?.error || "No se pudo verificar la mensualidad.",
      ledgerResult.status,
    );
  }

  const paymentCourse = (ledgerResult.body?.cursos || []).find((course) =>
    (course.pagosPendientes || []).some(
      (payment) => text(payment.$id) === paymentId,
    ),
  );

  if (!paymentCourse) {
    throw inputError("La mensualidad ya no está disponible.", 404);
  }

  if (
    normalizeBranchName(paymentCourse.sucursalNombre) !==
    normalizeBranchName(branch.name)
  ) {
    throw new ForbiddenError(
      `Esta mensualidad pertenece a la sucursal ${paymentCourse.sucursalNombre || "asignada en Control Instituto"}.`,
    );
  }
}

export async function GET(request) {
  try {
    await getCurrentUserContext({ redirectToLogin: false });
    const url = new URL(request.url);
    const ci = url.searchParams.get("ci") || "";
    const result = await requestInstitutePayments(
      `?ci=${encodeURIComponent(ci)}`,
      { method: "GET" },
    );

    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}

export async function POST(request) {
  try {
    const context = await getCurrentUserContext({ redirectToLogin: false });
    const payload = await request.json().catch(() => null);

    if (!payload || typeof payload !== "object") {
      return NextResponse.json(
        { error: "Solicitud inválida.", ok: false },
        { status: 400 },
      );
    }

    await assertPaymentBelongsToBranch(context, payload);
    const { branchId: _branchId, ...institutePayload } = payload;
    const result = await requestInstitutePayments("", {
      body: JSON.stringify(institutePayload),
      method: "POST",
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}
