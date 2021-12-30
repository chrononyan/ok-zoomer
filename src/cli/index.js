#!/usr/bin/env node

import fs from "fs/promises";
import Command from "./Command.js";

const program = new Command();

const pkg = JSON.parse(
  await fs.readFile(new URL("../../package.json", import.meta.url))
);
program.version(pkg.version);

import { DEFAULT_CONFIG_PATH } from "../config.js";
program.option(
  "-c, --config <path>",
  "path to config file",
  DEFAULT_CONFIG_PATH
);

import calnetCmd from "./calnet/index.js";
program.addCommand(calnetCmd);
import configCmd from "./config.js";
program.addCommand(configCmd);

try {
  await program.parseAsync();
} catch (err) {
  console.error(err);
  process.exit(1);
}
