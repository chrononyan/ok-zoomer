import convict from "convict";
import fs from "fs/promises";
import TOML from "@iarna/toml";
import { extname } from "path";
import { URI as OTPURI } from "otpauth";

export const DEFAULT_CONFIG_PATH = "ok-zoomer.toml";

convict.addParser({
  extension: "toml",
  parse: TOML.parse,
});

const config = convict({
  calnet: {
    username: {
      doc: "CalNet username",
      format: String,
      nullable: true,
      default: null,
    },
    password: {
      doc: "CalNet password",
      format: String,
      nullable: true,
      default: null,
    },
    duo: {
      deviceName: {
        doc: "Duo device name",
        format: String,
        nullable: true,
        default: null,
      },
      otpURI: {
        doc: "Duo OTP URI",
        format(val) {
          OTPURI.parse(val);
        },
        nullable: true,
        default: null,
      },
    },
  },
});

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
  const parser = getParser(path);
  const obj = config.getProperties();
  await fs.writeFile(path, parser.stringify(obj));
}

function getParser(path) {
  const ext = extname(path);
  if (ext === ".toml") {
    return TOML;
  }
  return JSON;
}
