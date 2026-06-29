import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  createSessionAccount,
  getClearedSessionCookieOptions,
} from "@/lib/appwrite/server";

export async function POST(request) {
  const cookieStore = await cookies();
  const sessionSecret = cookieStore.get(SESSION_COOKIE)?.value;

  if (sessionSecret) {
    try {
      const account = createSessionAccount(
        sessionSecret,
        request.headers.get("user-agent"),
      );
      await account.deleteSession({ sessionId: "current" });
    } catch {
      // The cookie is cleared even if the remote session is already gone.
    }
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    SESSION_COOKIE,
    "",
    getClearedSessionCookieOptions(),
  );

  return response;
}
