import Command from "../Command.js";
import fs from "fs/promises";

import * as duoUtils from "../../utils/duo.js";
import { loadConfig, saveConfig } from "../../config.js";

const sub = new Command();

sub
  .name("duo-enroll")
  .description("set up Duo 2FA by enrolling as a new device")
  .argument("[qr-path]", "path to a Duo activation QR code PNG", "qr.png")
  .action(async (qrPath, opts) => {
    let qrBuf = null;
    try {
      qrBuf = await fs.readFile(qrPath);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }

    const { data, hotp } = await duoUtils.activateDevice(qrBuf);
    console.log("Successfully enrolled!");
    console.log(`HOTP URI: ${hotp.toString()}`);
    console.log(`Device Key: ${data.pkey}`);

    const config = loadConfig(opts.config);
    config.set("calnet.duo.otpURI", hotp.toString());
    saveConfig(opts.config);
    console.log("Saved to config");
  });

export default sub;
