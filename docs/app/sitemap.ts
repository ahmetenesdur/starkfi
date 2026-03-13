import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
	const baseUrl = "https://docs.starkfi.app";

	const routes = [
		// Root
		"",
		"/docs",
		"/docs/installation",
		"/docs/quick-start",
		"/docs/authentication",
		"/docs/configuration",

		// Architecture
		"/docs/architecture",
		"/docs/architecture/error-handling",

		// CLI
		"/docs/cli",
		"/docs/cli/wallet",
		"/docs/cli/trading",
		"/docs/cli/staking",
		"/docs/cli/lending",
		"/docs/cli/batch",
		"/docs/cli/portfolio",

		// Integrations
		"/docs/integrations/starkzap",
		"/docs/integrations/fibrous",
		"/docs/integrations/vesu",
		"/docs/integrations/paymaster",

		// MCP
		"/docs/mcp",
		"/docs/mcp/setup",
		"/docs/mcp/tools-auth",
		"/docs/mcp/tools-wallet",
		"/docs/mcp/tools-trade",
		"/docs/mcp/tools-staking",
		"/docs/mcp/tools-lending",

		// Skills
		"/docs/skills",
	];

	return routes.map((route) => ({
		url: `${baseUrl}${route}`,
		lastModified: new Date(),
		changeFrequency: route === "" ? "weekly" : "monthly",
		priority: route === "" ? 1 : route === "/docs" ? 0.9 : 0.7,
	}));
}
