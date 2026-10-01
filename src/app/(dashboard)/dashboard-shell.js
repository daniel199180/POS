"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LogOut,
  History,
  Link2,
  ChartNoAxesCombined,
  Menu,
  Package,
  PanelLeftClose,
  CreditCard,
  QrCode,
  ReceiptText,
  Settings,
  ShoppingCart,
  Store,
  Users,
} from "lucide-react";

const navigation = [
  {
    href: "/",
    label: "Punto de venta",
    icon: ShoppingCart,
  },
  {
    href: "/enlaces-pago",
    label: "Enlaces de pago",
    icon: Link2,
  },
  {
    href: "/qr-estaticos",
    label: "QR estáticos",
    icon: QrCode,
  },
  {
    href: "/productos",
    label: "Productos",
    icon: Package,
    adminOnly: true,
    inventoryAccess: true,
  },
  {
    href: "/sucursales",
    label: "Sucursales",
    icon: Store,
    adminOnly: true,
  },
  {
    href: "/ventas",
    label: "Ventas",
    icon: ReceiptText,
    adminOnly: true,
  },
  {
    href: "/pagos",
    label: "Pagos",
    icon: CreditCard,
    adminOnly: true,
  },
  {
    href: "/analiticas",
    label: "Analíticas",
    icon: ChartNoAxesCombined,
    superAdminOnly: true,
  },
  {
    href: "/historial",
    label: "Historial de cambios",
    icon: History,
    adminOnly: true,
  },
  {
    href: "/usuarios",
    label: "Usuarios",
    icon: Users,
    adminOnly: true,
  },
  {
    href: "/configuraciones",
    label: "Configuraciones",
    icon: Settings,
    adminOnly: true,
  },
];

function BrandBlock({ collapsed, settings }) {
  const logoUrl = settings?.logo?.url || "";

  if (collapsed) {
    return null;
  }

  return (
    <div className="flex min-w-0 items-center gap-3">
      {logoUrl ? (
        <img
          src={logoUrl}
          alt="Logo POS"
          className="size-10 shrink-0 rounded-md object-contain"
        />
      ) : null}
      <div className="min-w-0">
        <p className="text-xs font-medium text-neutral-500 uppercase">POS V1</p>
        <p className="truncate text-sm font-semibold">Backoffice</p>
      </div>
    </div>
  );
}

export default function DashboardShell({ user, profile, settings, children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const visibleNavigation = navigation.filter((item) => {
    if (item.superAdminOnly) {
      return profile.role === "super_admin";
    }

    if (
      !item.adminOnly ||
      profile.role === "admin" ||
      profile.role === "super_admin"
    ) {
      return true;
    }

    return (
      item.inventoryAccess &&
      (profile.canIncreaseInventory || profile.canCreateProducts)
    );
  });

  useEffect(() => {
    setCollapsed(true);
  }, [pathname]);

  async function handleSignOut() {
    setIsSigningOut(true);

    await fetch("/api/auth/logout", {
      method: "POST",
    });

    router.replace("/login");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="flex min-h-screen">
        <aside
          className={`hidden border-r border-neutral-800 bg-neutral-950 transition-[width] duration-200 lg:block ${
            collapsed ? "w-[76px]" : "w-64"
          }`}
        >
          <div className="flex h-full flex-col">
            <div className="flex h-16 items-center justify-between border-b border-neutral-800 px-4">
              <BrandBlock collapsed={collapsed} settings={settings} />

              <button
                type="button"
                onClick={() => setCollapsed((current) => !current)}
                className="grid size-10 place-items-center rounded-md text-neutral-400 transition hover:bg-neutral-900 hover:text-neutral-100"
                aria-label={collapsed ? "Expandir menu" : "Replegar menu"}
                title={collapsed ? "Expandir menu" : "Replegar menu"}
              >
                {collapsed ? (
                  <Menu className="size-5" />
                ) : (
                  <PanelLeftClose className="size-5" />
                )}
              </button>
            </div>

            <nav className="flex-1 space-y-1 px-3 py-4">
              {visibleNavigation.map((item) => {
                const Icon = item.icon;
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition ${
                      isActive
                        ? "bg-neutral-100 text-neutral-950"
                        : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100"
                    } ${collapsed ? "justify-center" : ""}`}
                    title={item.label}
                  >
                    <Icon className="size-5 shrink-0" />
                    {!collapsed ? <span>{item.label}</span> : null}
                  </Link>
                );
              })}
            </nav>

            <div className="border-t border-neutral-800 p-3">
              {!collapsed ? (
                <div className="mb-3 rounded-md border border-neutral-800 bg-neutral-900 p-3">
                  <p className="truncate text-sm font-medium">
                    {user.name || "Sin nombre"}
                  </p>
                  <p className="mt-1 truncate text-xs text-neutral-500">
                    {user.email}
                  </p>
                  <span className="mt-3 inline-flex rounded-md border border-neutral-700 px-2 py-1 text-xs font-medium text-neutral-300 uppercase">
                    {profile.role === "super_admin"
                      ? "Super admin"
                      : profile.role}
                  </span>
                </div>
              ) : null}

              <button
                type="button"
                onClick={handleSignOut}
                disabled={isSigningOut}
                className={`flex h-11 w-full items-center gap-3 rounded-md border border-neutral-800 px-3 text-sm font-medium text-neutral-300 transition hover:border-neutral-600 hover:bg-neutral-900 hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 ${
                  collapsed ? "justify-center" : ""
                }`}
                title="Cerrar sesion"
              >
                <LogOut className="size-5 shrink-0" />
                {!collapsed ? (
                  <span>{isSigningOut ? "Cerrando..." : "Cerrar sesion"}</span>
                ) : null}
              </button>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-neutral-800 bg-neutral-950/95 lg:hidden">
            <div className="flex items-center justify-between px-4 py-4">
              <BrandBlock collapsed={false} settings={settings} />
              <button
                type="button"
                onClick={handleSignOut}
                disabled={isSigningOut}
                className="rounded-md border border-neutral-800 px-3 py-2 text-sm text-neutral-300"
              >
                {isSigningOut ? "Cerrando..." : "Salir"}
              </button>
            </div>
            <nav className="flex gap-2 overflow-x-auto px-4 pb-4">
              {visibleNavigation.map((item) => {
                const Icon = item.icon;
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-md border px-3 text-sm ${
                      isActive
                        ? "border-neutral-100 bg-neutral-100 text-neutral-950"
                        : "border-neutral-800 text-neutral-300"
                    }`}
                  >
                    <Icon className="size-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </header>

          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </div>
    </main>
  );
}
