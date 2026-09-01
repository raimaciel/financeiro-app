import React from "react";
import { CreditCard } from "lucide-react";

export function MastercardIcon({ className = "h-5 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="36" height="24" rx="4" fill="#0A0A0A" />
      <circle cx="14" cy="12" r="7" fill="#EB001B" />
      <circle cx="22" cy="12" r="7" fill="#F79E1B" fillOpacity="0.9" />
      <path
        d="M18 6.7A6.97 6.97 0 0015 12a6.97 6.97 0 003 5.3A6.97 6.97 0 0021 12a6.97 6.97 0 00-3-5.3z"
        fill="#FF5F00"
      />
    </svg>
  );
}

export function VisaIcon({ className = "h-5 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="36" height="24" rx="4" fill="#1A1F71" />
      <text
        x="50%"
        y="58%"
        dominantBaseline="middle"
        textAnchor="middle"
        fill="#FFFFFF"
        fontFamily="sans-serif"
        fontWeight="900"
        fontStyle="italic"
        fontSize="11"
        letterSpacing="0.5"
      >
        VISA
      </text>
    </svg>
  );
}

export function EloIcon({ className = "h-5 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="36" height="24" rx="4" fill="#000000" />
      <circle cx="10" cy="12" r="3.5" fill="#FFCC00" />
      <circle cx="18" cy="12" r="3.5" fill="#FF0033" />
      <circle cx="26" cy="12" r="3.5" fill="#00A4E4" />
      <text
        x="50%"
        y="78%"
        dominantBaseline="middle"
        textAnchor="middle"
        fill="#FFFFFF"
        fontFamily="sans-serif"
        fontWeight="800"
        fontSize="6"
        letterSpacing="0.5"
      >
        elo
      </text>
    </svg>
  );
}

export function AmexIcon({ className = "h-5 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="36" height="24" rx="4" fill="#006FCF" />
      <text
        x="50%"
        y="56%"
        dominantBaseline="middle"
        textAnchor="middle"
        fill="#FFFFFF"
        fontFamily="sans-serif"
        fontWeight="900"
        fontSize="8"
        letterSpacing="0.5"
      >
        AMEX
      </text>
    </svg>
  );
}

export function HipercardIcon({ className = "h-5 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="36" height="24" rx="4" fill="#B22222" />
      <text
        x="50%"
        y="58%"
        dominantBaseline="middle"
        textAnchor="middle"
        fill="#FFFFFF"
        fontFamily="sans-serif"
        fontWeight="900"
        fontStyle="italic"
        fontSize="6"
        letterSpacing="0.2"
      >
        HIPERCARD
      </text>
    </svg>
  );
}

export const BRAND_ICONS: Record<string, React.FC<{ className?: string }>> = {
  mastercard: MastercardIcon,
  visa: VisaIcon,
  elo: EloIcon,
  amex: AmexIcon,
  "american express": AmexIcon,
  hipercard: HipercardIcon,
};

export function BrandBadge({ brand, className }: { brand?: string | null; className?: string }) {
  if (!brand) return null;
  const key = brand.toLowerCase().trim();
  const Icon = BRAND_ICONS[key];

  if (Icon) {
    return <Icon className={className || "h-5 w-8 inline-block drop-shadow-xs"} />;
  }

  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded border border-white/30 backdrop-blur-xs">
      <CreditCard className="h-3 w-3" />
      {brand}
    </span>
  );
}
