import "./global.css";
import { RootProvider } from "fumadocs-ui/provider/next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import type { Metadata } from "next";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
	title: {
		template: "%s | StarkFi Docs",
		default: "StarkFi Docs",
	},
	description:
		"Documentation for StarkFi — Starknet DeFi CLI + MCP Server. Swaps, staking, lending, batch, gasless transactions.",
	icons: "/favicon.svg",
	metadataBase: new URL("https://docs.starkfi.app"),
	openGraph: {
		siteName: "StarkFi Docs",
		type: "website",
	},
};

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="en" className={inter.className} suppressHydrationWarning>
			<body>
				<RootProvider theme={{ defaultTheme: "dark" }}>{children}</RootProvider>
			</body>
		</html>
	);
}
