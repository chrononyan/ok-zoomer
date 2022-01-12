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
program.option("-H, --headful", "use a headful browser");
program.option("--no-headful", "use a headless browser (default)");
program.option("-q, --quiet", "suppress non-error output");

import calnetCmd from "./calnet/index.js";
program.addCommand(calnetCmd);
import configCmd from "./config.js";
program.addCommand(configCmd);
import zoomCmd from "./zoom/index.js";
program.addCommand(zoomCmd);

try {
  await program.parseAsync();
} catch (err) {
  console.error(err);
  process.exit(1);
}
