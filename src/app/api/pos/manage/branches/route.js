import { NextResponse } from "next/server";
import { appwriteFunctions } from "@/lib/appwrite/functions";
import { invokePosFunction } from "@/lib/appwrite/function-proxy";
import { getApiErrorResponse } from "@/lib/pos/auth";

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const { body, status } = await invokePosFunction(
      request,
      appwriteFunctions.management.branchesList,
      {
        query: {
          search: url.searchParams.get("search") || "",
        },
      },
    );

    return NextResponse.json(body, { status });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}

export async function POST(request) {
  try {
    const input = await request.json();
    const { body, status } = await invokePosFunction(
      request,
      appwriteFunctions.management.branchesCreate,
      { input },
    );

    return NextResponse.json(body, { status });
  } catch (error) {
    return getApiErrorResponse(error);
  }
}
