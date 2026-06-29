import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  createSessionAccount,
  getClearedSessionCookieOptions,
  toPublicUser,
} from "@/lib/appwrite/server";

export async function GET(request) {
  const cookieStore = await cookies();
  const sessionSecret = cookieStore.get(SESSION_COOKIE)?.value;

  if (!sessionSecret) {
    return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  }

  try {
    const account = createSessionAccount(
      sessionSecret,
      request.headers.get("user-agent"),
    );
    const user = await account.get();

    return NextResponse.json({ user: toPublicUser(user) });
  } catch {
    const response = NextResponse.json(
      { message: "Sesion expirada." },
      { status: 401 },
    );
    response.cookies.set(
      SESSION_COOKIE,
      "",
      getClearedSessionCookieOptions(),
    );

    return response;
  }
}
