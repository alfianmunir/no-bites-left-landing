"use client";

/**
 * EN / ID pill in the ops header. Writes the `ops_lang` cookie (server-readable,
 * so RSC re-renders localized) and refreshes. Not sensitive → set client-side.
 */
import { useRouter } from "next/navigation";
import type { OpsLang } from "@/lib/opsI18n";

export default function OpsLangToggle({ lang }: { lang: OpsLang }) {
  const router = useRouter();
  const set = (l: OpsLang) => {
    if (l === lang) return;
    document.cookie = `ops_lang=${l}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    router.refresh();
  };
  const opt = (l: OpsLang, label: string) => {
    const on = lang === l;
    return (
      <button
        onClick={() => set(l)}
        aria-pressed={on}
        style={{
          padding: "5px 11px",
          border: "none",
          background: on ? "var(--choco)" : "transparent",
          color: on ? "#fff" : "var(--soft)",
          fontWeight: 800,
          fontSize: 12,
          cursor: "pointer",
          borderRadius: 999,
        }}
      >
        {label}
      </button>
    );
  };
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 2, padding: 2, borderRadius: 999, border: "1.5px solid var(--line)", background: "#fff", flexShrink: 0 }}>
      {opt("en", "EN")}
      {opt("id", "ID")}
    </div>
  );
}
