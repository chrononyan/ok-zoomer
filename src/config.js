import convict from "convict";
import fs from "fs/promises";
import TOML from "@iarna/toml";
import { extname } from "path";

export const DEFAULT_CONFIG_PATH = "ok-zoomer.toml";

convict.addParser({
  extension: "toml",
  parse: TOML.parse,
});

const config = convict({});

function validateConfig() {
  config.validate({ allowed: "strict" });
}

export function loadConfig(path = DEFAULT_CONFIG_PATH) {
  try {
    config.loadFile(path);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  validateConfig();
  return config;
}

export async function saveConfig(path = DEFAULT_CONFIG_PATH) {
  validateConfig();
  let parser = getParser(path);
  let obj = config.getProperties();
  await fs.writeFile(path, parser.stringify(obj));
}

function getParser(path) {
  let ext = extname(path);
  if (ext === ".toml") {
    return TOML;
  }
  return JSON;
}
