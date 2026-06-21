import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { PwaOverlays } from "@/pwa";
import { useProjectStore } from "@/store";
import { LocaleSync } from "./LocaleSync";
import { PaletteSync } from "./PaletteSync";
import { LogoWatermark } from "@/ui/brand";
import { Sidebar } from "./Sidebar";

export function AppShell() {
  const { loaded, load } = useProjectStore();

  useEffect(() => {
    if (!loaded) {
      void load();
    }
  }, [loaded, load]);

  return (
    <div className="flex min-h-screen flex-col bg-[var(--rb-page-bg)]">
      <LocaleSync />
      <PaletteSync />
      <PwaOverlays />
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <Sidebar />
        <div className="relative min-w-0 flex-1">
          <LogoWatermark />
          <Outlet />
        </div>
      </div>
    </div>
  );
}
