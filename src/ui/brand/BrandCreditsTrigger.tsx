import { useState, type ReactNode } from "react";
import { useTranslation } from "@/i18n";
import { CreditsDialog } from "./CreditsDialog";

interface BrandCreditsTriggerProps {
  children: ReactNode;
  className?: string;
}

export function BrandCreditsTrigger({ children, className }: BrandCreditsTriggerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("brand.about")}
        className={className}
      >
        {children}
      </button>
      <CreditsDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
