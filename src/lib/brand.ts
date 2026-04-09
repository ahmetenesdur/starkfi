// Single source of truth for CLI brand palette.
// Used by index.ts (banner) and lib/format.ts (output formatting).
//
// Uses ANSI-256 color codes instead of hex/truecolor to ensure
// consistent rendering across all terminal environments.

import chalk from "chalk";

// ── Brand color helpers (ANSI-256 safe) ──
export const blue = chalk.ansi256(147); // pastel-blue  — indigo-300  (#a5b4fc)
export const mint = chalk.ansi256(122); // pastel-mint  — teal-200   (#99f6e4)
export const slate = chalk.ansi256(252); // slate-300   — table rows (#cbd5e1)

// ASCII logo row colors (blue → mint gradient)
export const LOGO_ROW_COLORS = [
	 chalk.hex("#a5b4fc"),
	 chalk.hex("#adbcfc"),
	 chalk.hex("#b5c4fb"),
	 chalk.hex("#bdccfb"),
	 chalk.hex("#c6d4fa"),
	 chalk.hex("#99f6e4"),
] as const;
