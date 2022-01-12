import undici from "undici";
import { HOTP, Secret as OTPSecret } from "otpauth";

import * as qrUtils from "./qr.js";

const DEVICE_HEADERS = {
  "User-Agent": "okhttp/4.9.0",
};
const DEVICE_INFO = {
  app_id: "com.duosecurity.duomobile",
  app_version: "4.4.0",
  app_build_number: "404000",
  full_disk_encryption: "true",
  manufacturer: "Samsung",
  model: "SM-G998U",
  platform: "Android",
  jailbroken: "false",
  version: "12",
  security_patch_level: "2021-12-05",
  passcode_status: "true",
  touchid_status: "true",
  language: "en",
  region: "US",
  architecture: "arm64",
};

export async function activateDevice(qrBufOrString) {
  let activationParams = qrBufOrString;
  if (typeof qrBufOrString !== "string") {
    activationParams = qrUtils.decodePNG(qrBufOrString).toString("ascii");
  }
  const [activationCode, base64APIHostname] = activationParams.split("-", 2);
  const apiHostname = Buffer.from(base64APIHostname, "base64").toString(
    "ascii"
  );

  const url = `https://${apiHostname}/push/v2/activation/${activationCode}`;
  // Randomize key order
  const body = Object.fromEntries(
    Object.entries(DEVICE_INFO).sort(() => 0.5 - Math.random())
  );
  const res = await undici.request(url, {
    method: "POST",
    headers: {
      ...DEVICE_HEADERS,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const resBody = await res.body.json();
  const data = resBody.response;

  const hotp = new HOTP({
    algorithm: "sha1",
    counter: 0,
    issuer: "Duo",
    label: `Duo: ${data.customer_name}`,
    secret: OTPSecret.fromLatin1(data.hotp_secret),
  });
  return {
    hotp,
    data,
  };
}
