/** Background themes + Playful palette (ported from the prototype). */
export type ThemeName = "Porcelain" | "Cream" | "Sand" | "Espresso";

export interface Palette {
  bg: string; surface: string; surface2: string; line: string;
  ink: string; soft: string; dark: string; onDark: string;
  orange?: string; red?: string; green?: string; choco?: string; blue?: string;
}

export const THEMES: Record<ThemeName, Palette> = {
  Porcelain: { bg: "#f4f0e8", surface: "#ffffff", surface2: "#faf6ef", line: "rgba(40,26,11,0.10)", ink: "#281a0b", soft: "#6f5c45", dark: "#1d130a", onDark: "#f4ebdd" },
  Cream: { bg: "#fdefd9", surface: "#fff8ec", surface2: "#fff4e3", line: "rgba(84,48,11,0.14)", ink: "#241504", soft: "#6b4a22", dark: "#241504", onDark: "#fdefd9" },
  Sand: { bg: "#e9e1d2", surface: "#f6f1e7", surface2: "#efe7d8", line: "rgba(40,26,11,0.12)", ink: "#2a1c0c", soft: "#6f5c45", dark: "#2a1c0c", onDark: "#f3ece0" },
  Espresso: { bg: "#1d140c", surface: "#2a1d12", surface2: "#241a10", line: "rgba(244,235,221,0.14)", ink: "#f4ebdd", soft: "#c8b6a0", dark: "#140d06", onDark: "#f4ebdd" },
};

/** Playful overrides ALL tokens (incl. accents) when opted in. */
export const PLAYFUL: Palette = {
  bg: "#ffe6c2", surface: "#fffaf2", surface2: "#fff0d6", line: "rgba(255,61,110,0.22)",
  ink: "#3a1408", soft: "#9a4f2c", dark: "#3a1408", onDark: "#ffe6c2",
  orange: "#ff6a00", red: "#ff3d6e", green: "#10a64a", choco: "#7a3b12", blue: "#0fb5d6",
};

export const THEME_ORDER: ThemeName[] = ["Porcelain", "Cream", "Sand", "Espresso"];

/** Small swatches for the first-visit picker cards. */
export const THEME_SWATCHES: Record<ThemeName, { sw1: string; sw2: string; sw3: string }> = {
  Porcelain: { sw1: "#f4f0e8", sw2: "#ffffff", sw3: "#f58c21" },
  Cream: { sw1: "#fdefd9", sw2: "#fff8ec", sw3: "#f58c21" },
  Sand: { sw1: "#e9e1d2", sw2: "#f6f1e7", sw3: "#c98a2b" },
  Espresso: { sw1: "#1d140c", sw2: "#2a1d12", sw3: "#f58c21" },
};

/** Turn a palette into the CSS custom properties the landing reads. */
export function paletteVars(p: Palette): React.CSSProperties {
  const v: Record<string, string> = {
    "--bg": p.bg, "--surface": p.surface, "--surface2": p.surface2, "--line": p.line,
    "--ink": p.ink, "--soft": p.soft, "--dark": p.dark, "--on-dark": p.onDark,
  };
  if (p.orange) v["--orange"] = p.orange;
  if (p.red) v["--red"] = p.red;
  if (p.green) v["--green"] = p.green;
  if (p.choco) v["--choco"] = p.choco;
  if (p.blue) v["--blue"] = p.blue;
  return v as React.CSSProperties;
}
