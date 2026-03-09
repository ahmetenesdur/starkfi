#!/usr/bin/env node

import { createRequire } from "node:module";
import { Command } from "commander";
import { formatError } from "./lib/format.js";
import { startMcpServer } from "./mcp/server.js";

// Graceful shutdown on signals
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

import { registerLoginCommand } from "./commands/auth/login.js";
import { registerVerifyCommand } from "./commands/auth/verify.js";
import { registerLogoutCommand } from "./commands/auth/logout.js";
import { registerAddressCommand } from "./commands/wallet/address.js";
import { registerBalanceCommand } from "./commands/wallet/balance.js";
import { registerSendCommand } from "./commands/wallet/send.js";
import { registerDeployCommand } from "./commands/wallet/deploy.js";
import { registerSwapCommand } from "./commands/trade/swap.js";
import { registerStatusCommand } from "./commands/trade/status.js";
import { registerTxStatusCommand } from "./commands/chain/tx-status.js";
import {
	registerStakeCommand,
	registerUnstakeCommand,
	registerRewardsCommand,
	registerPoolsCommand,
	registerValidatorsCommand,
	registerStakeStatusCommand,
} from "./commands/staking/staking.js";
import { registerConfigCommand } from "./commands/config/config.js";
import {
	registerLendPoolsCommand,
	registerLendSupplyCommand,
	registerLendWithdrawCommand,
	registerLendBorrowCommand,
	registerLendRepayCommand,
	registerLendCloseCommand,
	registerLendStatusCommand,
} from "./commands/lending/lending.js";
import { registerPortfolioCommand } from "./commands/portfolio/portfolio.js";
import { registerMultiSwapCommand } from "./commands/trade/multi-swap.js";
import { registerBatchCommand } from "./commands/batch/batch.js";

const program = new Command();

program
	.name("starkfi")
	.description("Starknet DeFi CLI — Token swaps, staking, lending, gasless transactions")
	.version(version)
	.showHelpAfterError();

registerLoginCommand(program);
registerVerifyCommand(program);
registerLogoutCommand(program);

registerAddressCommand(program);
registerBalanceCommand(program);
registerSendCommand(program);
registerDeployCommand(program);

registerSwapCommand(program);
registerMultiSwapCommand(program);
registerStatusCommand(program);

registerTxStatusCommand(program);

registerStakeCommand(program);
registerUnstakeCommand(program);
registerRewardsCommand(program);
registerPoolsCommand(program);
registerValidatorsCommand(program);
registerStakeStatusCommand(program);

registerLendPoolsCommand(program);
registerLendSupplyCommand(program);
registerLendWithdrawCommand(program);
registerLendBorrowCommand(program);
registerLendRepayCommand(program);
registerLendCloseCommand(program);
registerLendStatusCommand(program);

registerPortfolioCommand(program);

registerBatchCommand(program);

registerConfigCommand(program);

program
	.command("mcp-start")
	.description("Start the MCP server (stdio transport)")
	.action(async () => {
		await startMcpServer();
	});

program.parseAsync().catch((error: unknown) => {
	console.error(formatError(error));
	process.exit(1);
});
