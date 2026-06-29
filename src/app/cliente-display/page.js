import CustomerDisplayClient from "./customer-display-client";
import { getCurrentUserContext } from "@/lib/pos/auth";

export const metadata = {
  title: "Pantalla Cliente",
};

export default async function CustomerDisplayPage({ searchParams }) {
  await getCurrentUserContext();
  const params = await searchParams;
  const sessionId =
    typeof params?.session === "string" ? params.session.trim() : "";

  return <CustomerDisplayClient initialSessionId={sessionId} />;
}
