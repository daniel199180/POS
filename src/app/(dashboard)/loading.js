import { Loader2 } from "lucide-react";

export default function DashboardLoading() {
  return (
    <div className="grid min-h-[65vh] place-items-center p-6" role="status">
      <div className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900 px-5 py-4 text-sm text-neutral-300 shadow-xl">
        <Loader2 className="size-5 animate-spin text-cyan-300" />
        Cargando información…
      </div>
    </div>
  );
}
