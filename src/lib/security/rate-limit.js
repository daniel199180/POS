import crypto from "node:crypto";

const buckets = new Map();
const MAX_BUCKETS = 10_000;

function digest(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function prune(now) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }

  if (buckets.size <= MAX_BUCKETS) return;
  for (const key of buckets.keys()) {
    buckets.delete(key);
    if (buckets.size <= MAX_BUCKETS) break;
  }
}

export function requestFingerprint(request, extra = "") {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    forwarded.split(",")[0]?.trim() ||
    "unknown";
  return digest(`${ip}|${extra}`);
}

export function assertRateLimit({ namespace, key, limit, windowMs }) {
  const now = Date.now();
  if (buckets.size >= MAX_BUCKETS) prune(now);
  const bucketKey = `${namespace}:${key}`;
  const current = buckets.get(bucketKey);

  if (!current || current.resetAt <= now) {
    buckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return;
  }

  if (current.count >= limit) {
    const error = new Error(
      "Demasiadas solicitudes. Espera un momento antes de volver a intentar.",
    );
    error.status = 429;
    throw error;
  }

  current.count += 1;
}
