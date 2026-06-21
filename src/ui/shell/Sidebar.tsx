import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "@/i18n";
import { useProjectStore, useSettingsStore } from "@/store";
import { BrandCreditsTrigger, MiniLogo } from "@/ui/brand";
import {
  SETTINGS_SECTION_NAV,
  scrollToSettingsSection,
  type SettingsSectionId,
} from "@/ui/settings/sections";
import { FEATURE_NAV } from "./featureNav";
import { FeatureIcon } from "./featureIcons";

const PANEL_EXPAND_DELAY_MS = 180;
const DRAWER_TRANSITION_MS = 280;

type DockMode = "features" | "settings";

export function Sidebar() {
  const { t } = useTranslation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMounted, setDrawerMounted] = useState(false);
  const [drawerClosing, setDrawerClosing] = useState(false);
  const [drawerSession, setDrawerSession] = useState(0);
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (drawerOpen) {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      setDrawerClosing(false);
      setDrawerMounted(true);
      return;
    }

    if (!drawerMounted) {
      return;
    }

    setDrawerClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      setDrawerMounted(false);
      setDrawerClosing(false);
      closeTimerRef.current = null;
    }, DRAWER_TRANSITION_MS);

    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, [drawerOpen, drawerMounted]);

  const openDrawer = () => {
    setDrawerSession((session) => session + 1);
    setDrawerOpen(true);
  };

  const closeDrawer = () => setDrawerOpen(false);

  return (
    <>
      <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-white/5 bg-[var(--rb-sidebar-bg)] px-3 text-[var(--rb-sidebar-text)] md:hidden">
        <button
          type="button"
          onClick={openDrawer}
          aria-label={t("nav.openMenu")}
          className="flex h-9 w-9 shrink-0 items-center justify-center text-gray-400 transition-colors hover:text-white"
        >
          <MenuIcon />
        </button>
        <div className="ml-auto flex min-w-0 items-center gap-2 truncate text-lg font-semibold tracking-tight">
          <BrandCreditsTrigger className="shrink-0 rounded-sm transition-opacity hover:opacity-80">
            <MiniLogo className="h-7 w-7" />
          </BrandCreditsTrigger>
          <NavLink to="/" className="truncate">
            ResearchBox
          </NavLink>
        </div>
      </header>

      {drawerMounted && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className={[
              "absolute inset-0 bg-black/40",
              drawerClosing
                ? "opacity-0 transition-opacity ease-[cubic-bezier(0.32,0.72,0,1)]"
                : "rb-drawer-backdrop-enter",
            ].join(" ")}
            style={drawerClosing ? { transitionDuration: `${DRAWER_TRANSITION_MS}ms` } : undefined}
            onClick={closeDrawer}
            aria-hidden
          />
          <aside
            key={drawerSession}
            className={[
              "absolute left-0 top-0 flex h-full w-64 max-w-[80%] flex-col bg-[var(--rb-sidebar-bg)] text-[var(--rb-sidebar-text)] will-change-transform",
              drawerClosing
                ? "-translate-x-full transition-transform ease-[cubic-bezier(0.32,0.72,0,1)]"
                : "rb-drawer-enter",
            ].join(" ")}
            style={drawerClosing ? { transitionDuration: `${DRAWER_TRANSITION_MS}ms` } : undefined}
          >
            <SidebarContent onNavigate={closeDrawer} onClose={closeDrawer} />
          </aside>
        </div>
      )}

      <aside className="hidden md:sticky md:top-0 md:flex md:h-screen md:w-56 md:shrink-0 md:flex-col md:border-r md:border-white/5 md:bg-[var(--rb-sidebar-bg)] md:text-[var(--rb-sidebar-text)]">
        <SidebarContent />
      </aside>
    </>
  );
}

interface SidebarContentProps {
  onNavigate?: () => void;
  onClose?: () => void;
}

function SidebarContent({ onNavigate, onClose }: SidebarContentProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { projects, activeProjectId, getActiveProject } = useProjectStore();
  const { providers, loaded: settingsLoaded, load: loadSettings } = useSettingsStore();
  const active = getActiveProject();
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const isSettingsRoute = location.pathname === "/settings";
  const isFeatureActive = FEATURE_NAV.some((item) => item.isActive(location.pathname));

  const [dockMode, setDockMode] = useState<DockMode>(isSettingsRoute ? "settings" : "features");
  const [featuresExpanded, setFeaturesExpanded] = useState(
    !isSettingsRoute && isFeatureActive,
  );
  const [settingsExpanded, setSettingsExpanded] = useState(isSettingsRoute);

  const visibleSettingsSections = SETTINGS_SECTION_NAV.filter(
    (section) => !section.requiresSavedProviders || providers.length > 0,
  );

  useEffect(() => {
    if (!settingsLoaded) {
      void loadSettings();
    }
  }, [settingsLoaded, loadSettings]);

  const prevPathnameRef = useRef(location.pathname);

  useEffect(() => {
    const pathnameChanged = prevPathnameRef.current !== location.pathname;
    prevPathnameRef.current = location.pathname;

    if (isSettingsRoute) {
      if (pathnameChanged) {
        setDockMode("settings");
        setFeaturesExpanded(false);
        const timer = window.setTimeout(() => setSettingsExpanded(true), PANEL_EXPAND_DELAY_MS);
        return () => window.clearTimeout(timer);
      }
      return;
    }

    setDockMode("features");
    setSettingsExpanded(false);
    if (isFeatureActive) {
      setFeaturesExpanded(true);
    }
  }, [location.pathname, isSettingsRoute, isFeatureActive]);

  function switchTo(projectId: string) {
    setSwitcherOpen(false);
    onNavigate?.();
    navigate(`/p/${encodeURIComponent(projectId)}/paper-box`);
  }

  function goHome() {
    onNavigate?.();
    navigate("/");
  }

  function goToSettingsSection(id: SettingsSectionId) {
    onNavigate?.();
    if (isSettingsRoute) {
      scrollToSettingsSection(id);
      return;
    }
    navigate("/settings", { state: { scrollTo: id } });
  }

  function openSettings() {
    onNavigate?.();
    setFeaturesExpanded(false);
    setSettingsExpanded(false);
    setDockMode("settings");
    navigate("/settings");
    window.setTimeout(() => setSettingsExpanded(true), PANEL_EXPAND_DELAY_MS);
  }

  function handleFeaturesClick() {
    if (dockMode === "settings") {
      setSettingsExpanded(false);
      setDockMode("features");
      window.setTimeout(() => setFeaturesExpanded(true), PANEL_EXPAND_DELAY_MS);

      if (!activeProjectId) {
        onNavigate?.();
        navigate("/");
      }
      return;
    }

    setFeaturesExpanded((expanded) => !expanded);
  }

  function goToFeature(path: string) {
    onNavigate?.();
    navigate(path);
  }

  const settingsMode = dockMode === "settings";

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-white/5 px-3 py-2.5">
        <div className="flex items-center gap-0.5">
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setSwitcherOpen((open) => !open)}
              aria-expanded={switcherOpen}
              aria-label={t("nav.switchProject")}
              className={[
                "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left transition-colors",
                switcherOpen
                  ? "bg-white/5 text-white"
                  : "text-gray-300 hover:bg-white/5 hover:text-white",
              ].join(" ")}
            >
              <FolderIcon />
              <div className="min-w-0 flex-1">
                <span className="block text-[10px] leading-tight tracking-wide text-gray-500 uppercase">
                  {t("nav.currentProject")}
                </span>
                <span className="block min-w-0 truncate text-sm font-medium">
                  {active ? active.name : t("nav.noActiveProject")}
                </span>
              </div>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 ${switcherOpen ? "rotate-180" : ""}`}
                aria-hidden
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </div>

          <div className="ml-0.5 shrink-0 border-l border-white/10 pl-1">
            <button
              type="button"
              onClick={goHome}
              aria-label={t("nav.home")}
              title={t("nav.home")}
              className="flex h-9 w-9 items-center justify-center rounded-sm text-gray-500 transition-colors hover:bg-white/5 hover:text-white"
            >
              <HomeIcon />
            </button>
          </div>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label={t("nav.closeMenu")}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-gray-500 transition-colors hover:bg-white/5 hover:text-white"
            >
              <CloseIcon />
            </button>
          )}
        </div>

        <CollapsiblePanel open={switcherOpen} durationMs={220}>
          <div className="mt-1 border-t border-white/10 pt-1">
            <div className="max-h-72 overflow-auto rounded-sm bg-white/[0.03] py-0.5">
              {projects.length === 0 ? (
                <p className="px-2.5 py-2 text-xs text-gray-500">{t("project.empty")}</p>
              ) : (
                projects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => switchTo(project.id)}
                    className={[
                      "block w-full truncate border-l-2 px-2.5 py-2 text-left text-sm transition-colors",
                      project.id === activeProjectId
                        ? "border-white/70 bg-white/5 font-medium text-white"
                        : "border-transparent text-gray-400 hover:bg-white/[0.04] hover:text-gray-200",
                    ].join(" ")}
                  >
                    {project.name}
                  </button>
                ))
              )}
            </div>
          </div>
        </CollapsiblePanel>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-1.5 pb-2 pt-1">
        <DockHeaderButton
          label={t("nav.features")}
          icon={<FeaturesIcon />}
          active={isFeatureActive && !settingsMode}
          expanded={featuresExpanded}
          onClick={handleFeaturesClick}
        />

        <CollapsiblePanel open={featuresExpanded} durationMs={300} className="pt-1">
          <nav aria-label={t("nav.features")} className="mt-0.5 space-y-0.5 border-l border-white/10 pl-2.5">
            {FEATURE_NAV.map((item) => {
              const disabled = item.requiresProject && !activeProjectId;
              const path = activeProjectId ? item.path(activeProjectId) : "/";
              const active = item.isActive(location.pathname);

              if (disabled) {
                return (
                  <span
                    key={item.id}
                    title={t("noProject.title")}
                    aria-disabled
                    className="flex cursor-not-allowed items-center gap-2.5 rounded-sm px-2 py-2 text-sm text-gray-600 opacity-60"
                  >
                    <FeatureIcon id={item.icon} className="h-4 w-4 shrink-0" />
                    <span className="truncate">{t(item.labelKey)}</span>
                  </span>
                );
              }

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => goToFeature(path)}
                  className={[
                    "flex w-full items-center gap-2.5 rounded-sm px-2 py-2 text-left text-sm transition-colors",
                    active
                      ? "bg-white/5 font-medium text-white"
                      : "text-gray-400 hover:bg-white/[0.04] hover:text-gray-200",
                  ].join(" ")}
                >
                  <FeatureIcon
                    id={item.icon}
                    className={`h-4 w-4 shrink-0 ${active ? "text-white" : "text-gray-500"}`}
                  />
                  <span className="truncate">{t(item.labelKey)}</span>
                </button>
              );
            })}
          </nav>
        </CollapsiblePanel>

        <div
          aria-hidden
          className={[
            "min-h-0 transition-[flex-grow,flex-basis] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
            settingsMode ? "flex-none grow-0 basis-0" : "flex-1 grow",
          ].join(" ")}
        />

        {settingsMode ? (
          <DockHeaderButton
            label={t("nav.settings")}
            icon={<GearIcon />}
            active
            expanded={settingsExpanded}
            onClick={() => setSettingsExpanded((expanded) => !expanded)}
          />
        ) : (
          <DockActionButton
            label={t("nav.settings")}
            icon={<GearIcon />}
            onClick={openSettings}
          />
        )}

        <CollapsiblePanel open={settingsMode && settingsExpanded} durationMs={300} shrink>
          <nav aria-label={t("nav.settings")} className="space-y-px pl-2 pt-0.5">
            {visibleSettingsSections.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => goToSettingsSection(section.id)}
                className="flex w-full items-center px-2 py-1.5 text-left text-xs text-gray-500 transition-colors hover:text-gray-200"
              >
                <span className="truncate">{t(section.labelKey)}</span>
              </button>
            ))}
          </nav>
        </CollapsiblePanel>
      </div>

      <div className="mt-auto shrink-0 border-t border-white/5 px-3 py-3">
        <BrandCreditsTrigger className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-300">
          <MiniLogo className="h-5 w-5 shrink-0 text-[var(--rb-primary)]" />
          <div className="min-w-0 text-left">
            <span className="block text-xs font-medium tracking-wide">ResearchBox</span>
            <span className="block truncate text-[10px] text-gray-600">
              {t("brand.tagline")}
            </span>
          </div>
        </BrandCreditsTrigger>
      </div>
    </div>
  );
}

interface CollapsiblePanelProps {
  open: boolean;
  durationMs?: number;
  shrink?: boolean;
  className?: string;
  children: React.ReactNode;
}

function CollapsiblePanel({
  open,
  durationMs = 300,
  shrink = false,
  className = "",
  children,
}: CollapsiblePanelProps) {
  return (
    <div
      aria-hidden={!open}
      className={[
        "grid transition-[grid-template-rows,opacity] ease-[cubic-bezier(0.32,0.72,0,1)]",
        shrink ? "shrink-0" : "",
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        className,
      ].join(" ")}
      style={{ transitionDuration: `${durationMs}ms` }}
    >
      <div
        className={[
          "min-h-0 overflow-hidden transition-transform ease-[cubic-bezier(0.32,0.72,0,1)]",
          open ? "translate-y-0" : "-translate-y-1",
        ].join(" ")}
        style={{ transitionDuration: `${durationMs}ms` }}
      >
        {children}
      </div>
    </div>
  );
}

interface DockHeaderButtonProps {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  expanded?: boolean;
  disabled?: boolean;
  disabledTitle?: string;
  onClick?: () => void;
}

function DockHeaderButton({
  label,
  icon,
  active,
  expanded,
  disabled,
  disabledTitle,
  onClick,
}: DockHeaderButtonProps) {
  if (disabled) {
    return (
      <span
        title={disabledTitle}
        aria-disabled
        className="flex cursor-not-allowed items-center gap-2.5 px-2 py-1.5 text-sm text-gray-600 opacity-60"
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center">{icon}</span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      className={[
        "flex w-full items-center gap-2.5 px-2 py-1.5 text-sm transition-colors",
        active
          ? "font-medium text-white"
          : "text-gray-400 hover:text-gray-200",
      ].join(" ")}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={[
          "h-4 w-4 shrink-0 opacity-70 transition-transform duration-200",
          expanded ? "rotate-180" : "",
        ].join(" ")}
        aria-hidden
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
  );
}

interface DockActionButtonProps {
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
}

function DockActionButton({ label, icon, onClick }: DockActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-2 py-1.5 text-sm text-gray-400 transition-colors hover:text-gray-200"
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
    </button>
  );
}

function MenuIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      className="h-5 w-5"
      aria-hidden
    >
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0 text-gray-500"
      aria-hidden
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden
    >
      <path d="M3 9.5 12 3l9 6.5" />
      <path d="M5 10v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V10" />
      <path d="M9 21v-6h6v6" />
    </svg>
  );
}

function FeaturesIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden
    >
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
