import flatten from "flat";
import Command from "./Command.js";

import { loadConfig, saveConfig } from "../config.js";

const sub = new Command();

sub
  .name("config")
  .description("get or set config options")
  .argument("[name]", "get or set a config option by name")
  .argument("[value]", "set the config option to a specific value")
  .action(async (name, val, opts) => {
    let didSave = false;
    try {
      const config = loadConfig(opts.config);
      if (val) {
        config.set(name, val);
        await saveConfig(opts.config);
        didSave = true;
      }
      val = config.get(name);
    } catch (err) {
      console.error(`${err.name}: ${err.message}`);
      process.exit(1);
    }
    if (val !== null && typeof val === "object") {
      val = flatten(val);
    } else {
      val = {
        [name]: val,
      };
    }
    for (const [eName, eVal] of Object.entries(val)) {
      console.log(`${eName} = ${eVal === null ? "" : JSON.stringify(eVal)}`);
    }
    if (didSave) {
      console.error("Saved to config");
    }
  });

export default sub;
