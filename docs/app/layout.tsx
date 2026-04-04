import "./global.css";
import { RootProvider } from "fumadocs-ui/provider/next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import type { Metadata } from "next";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
	title: {
		template: "%s | StarkFi Docs",
		default: "StarkFi Docs — Starknet DeFi CLI + MCP Server",
	},
	description:
		"Official documentation for StarkFi — Starknet DeFi CLI + MCP Server. 35+ commands, 42 MCP tools, 12 Agent Skills. Swaps, staking, lending, DCA, batch, gasless transactions.",
	keywords: [
		"StarkFi",
		"Starknet",
		"DeFi",
		"CLI",
		"MCP",
		"MCP Server",
		"AI Agent",
		"Starkzap",
		"Documentation",
		"Swap",
		"Stake",
		"Lend",
		"Batch",
		"DCA",
		"Gasless",
		"Web3",
	],
	authors: [{ name: "ahmetenesdur", url: "https://github.com/ahmetenesdur" }],
	creator: "ahmetenesdur",
	publisher: "StarkFi",
	icons: "/favicon.svg",
	metadataBase: new URL("https://docs.starkfi.app"),
	robots: {
		index: true,
		follow: true,
		googleBot: {
			index: true,
			follow: true,
			"max-snippet": -1,
			"max-image-preview": "large",
			"max-video-preview": -1,
		},
	},
	openGraph: {
		title: "StarkFi Docs — Starknet DeFi CLI + MCP Server",
		description:
			"Official documentation for StarkFi. 35+ CLI commands, 42 MCP tools, 12 Agent Skills for Starknet DeFi automation.",
		url: "https://docs.starkfi.app",
		siteName: "StarkFi Docs",
		images: [
			{
				url: "/og-image.png",
				width: 1200,
				height: 630,
				alt: "StarkFi — Starknet DeFi from your Terminal & AI",
			},
		],
		locale: "en_US",
		type: "website",
	},
	twitter: {
		card: "summary_large_image",
		title: "StarkFi Docs — Starknet DeFi from your Terminal & AI",
		description:
			"35+ CLI commands, 42 MCP tools, 12 Agent Skills. Swap, stake, lend, DCA, batch on Starknet with gas abstraction.",
		images: ["/og-image.png"],
		site: "@starkfiapp",
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
