import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  createAdminAccount,
  getAuthErrorResponse,
  getSessionCookieOptions,
} from "@/lib/appwrite/server";

export async function POST(request) {
  try {
    const body = await request.json();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!email || !password) {
      return NextResponse.json(
        { message: "Email y contrasena son requeridos." },
        { status: 400 },
      );
    }

    const account = createAdminAccount(request.headers.get("user-agent"));
    const session = await account.createEmailPasswordSession({
      email,
      password,
    });

    const response = NextResponse.json({
      userId: session.userId,
    });

    response.cookies.set(
      SESSION_COOKIE,
      session.secret,
      getSessionCookieOptions(new Date(session.expire)),
    );

    return response;
  } catch (error) {
    const { status, body } = getAuthErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
