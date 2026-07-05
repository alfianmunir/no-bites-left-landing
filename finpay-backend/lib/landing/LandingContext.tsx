"use client";

/**
 * Landing UI state: language (EN/ID), background theme, and Playful mode — all
 * persisted to localStorage (same keys as the prototype: nbl-lang, nbl-theme,
 * nbl-playful) and read pre-paint to avoid a flash. Exposes the active copy
 * dictionary `t` and the CSS-variable object for the active palette.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode, type CSSProperties } from "react";
import { STR, type Lang } from "@/lib/i18n/strings";
import { THEMES, PLAYFUL, paletteVars, type ThemeName } from "./themes";

interface LandingValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
  playful: boolean;
  setPlayful: (p: boolean) => void;
  t: (typeof STR)["en"];
  themeVars: CSSProperties;
  showPicker: boolean;
  dismissPicker: () => void;
}

const LandingContext = createContext<LandingValue | null>(null);

function readLS(key: string): string | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem(key); } catch { return null; }
}

export function LandingProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  const [theme, setThemeState] = useState<ThemeName>("Porcelain");
  const [playful, setPlayfulState] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const l = readLS("nbl-lang");
    if (l === "en" || l === "id") setLangState(l);
    const tm = readLS("nbl-theme");
    if (tm && tm in THEMES) setThemeState(tm as ThemeName);
    setPlayfulState(readLS("nbl-playful") === "1");
    setShowPicker(!tm); // first visit (no theme chosen) shows the picker
    setHydrated(true);
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { window.localStorage.setItem("nbl-lang", l); } catch {}
  }, []);
  const setTheme = useCallback((tm: ThemeName) => {
    setThemeState(tm);
    try { window.localStorage.setItem("nbl-theme", tm); } catch {}
  }, []);
  const setPlayful = useCallback((p: boolean) => {
    setPlayfulState(p);
    try { window.localStorage.setItem("nbl-playful", p ? "1" : "0"); } catch {}
  }, []);
  const dismissPicker = useCallback(() => {
    setShowPicker(false);
    // Lock in the current (default) theme so the picker doesn't reappear.
    try { if (!readLS("nbl-theme")) window.localStorage.setItem("nbl-theme", "Porcelain"); } catch {}
  }, []);

  const themeVars = useMemo<CSSProperties>(() => paletteVars(playful ? PLAYFUL : THEMES[theme]), [playful, theme]);

  const value: LandingValue = {
    lang, setLang, theme, setTheme, playful, setPlayful,
    t: STR[lang],
    themeVars,
    showPicker: hydrated && showPicker,
    dismissPicker,
  };
  return <LandingContext.Provider value={value}>{children}</LandingContext.Provider>;
}

export function useLanding(): LandingValue {
  const ctx = useContext(LandingContext);
  if (!ctx) throw new Error("useLanding() must be used within <LandingProvider>");
  return ctx;
}
