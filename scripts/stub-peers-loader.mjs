/**
 * Dev-mode module loader entry point.
 *
 * Node.js v24 requires module customization hooks to run in a separate
 * thread via module.register(). This file is loaded by --import and
 * registers the resolve/load hooks from stub-peers-hooks.mjs.
 *
 * Build-time stubbing is handled separately by the esbuild plugin
 * in tsup.config.ts — this file only affects `pnpm dev`.
 */

import { register } from "node:module";

register("./stub-peers-hooks.mjs", import.meta.url);
