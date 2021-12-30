import undici from "undici";
import { HOTP, Secret as OTPSecret } from "otpauth";

import * as qrUtils from "./qr.js";

export async function activateDevice(qrBuf) {
  let activationParams = qrUtils.decodePNG(qrBuf).toString("ascii");
  let [activationCode, base64APIHostname] = activationParams.split("-", 2);
  let apiHostname = Buffer.from(base64APIHostname, "base64").toString("ascii");

  let url = `https://${apiHostname}/push/v2/activation/${activationCode}`;
  let headers = {
    "content-type": "application/json",
    "user-agent": "okhttp/4.9.0",
  };
  let body = {
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
  // Randomize key order
  body = Object.fromEntries(
    Object.entries(body).sort(() => 0.5 - Math.random())
  );
  let res = await undici.request(url, {
    method: "POST",
    headers: headers,
    body: JSON.stringify(body),
  });
  let resBody = await res.body.json();
  let activationData = resBody.response;

  let hotp = new HOTP({
    algorithm: "sha1",
    counter: 0,
    issuer: "Duo",
    label: `Duo: ${activationData.customer_name}`,
    secret: OTPSecret.fromLatin1(activationData.hotp_secret),
  });
  return hotp;
}
