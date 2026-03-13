// Single source of truth for CLI brand palette.
// Used by index.ts (banner) and lib/format.ts (output formatting).

export const BLUE = "#a5b4fc"; // pastel-blue  — indigo-300
export const MINT = "#99f6e4"; // pastel-mint  — teal-200
export const SLATE = "#cbd5e1"; // slate-300   — table even rows

// ASCII logo row colors (blue → mint gradient)
export const LOGO_ROW_COLORS = [
	"#a5b4fc",
	"#adbcfc",
	"#b5c4fb",
	"#bdccfb",
	"#c6d4fa",
	"#99f6e4",
] as const;
