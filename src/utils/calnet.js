import { URI as OTPURI } from "otpauth";

import { loadConfig, saveConfig } from "../config.js";

export function generateDuoToken(opts = {}) {
  let { config, configPath } = opts;

  if (!config) {
    config = loadConfig(configPath);
  }
  let uri = config.get("calnet.duo.otpURI");
  if (!uri) throw new Error(`Missing config option: calnet.duo.otpURI`);

  let hotp = OTPURI.parse(uri);
  let token = hotp.generate();
  config.set("calnet.duo.otpURI", hotp.toString());
  saveConfig(configPath);

  return token;
}

export async function gotoWithAuth(page, url, opts = {}) {
  let { check, configPath } = opts;

  await page.goto(url);

  let currentURLObj = new URL(page.url());
  if (
    currentURLObj.origin === "https://auth.berkeley.edu" &&
    currentURLObj.pathname === "/cas/login"
  ) {
    let config = loadConfig(configPath);

    let username = config.get("calnet.username");
    if (!username) throw new Error(`Missing config option: calnet.username`);
    let password = config.get("calnet.password");
    if (!password) throw new Error(`Missing config option: calnet.password`);

    let usernameElem = await page.waitForSelector("#loginForm input#username", {
      visible: true,
    });
    await usernameElem.type(username);

    let passwordElem = await page.waitForSelector("#loginForm input#password", {
      visible: true,
    });
    await passwordElem.type(password);
    await passwordElem.press("Enter");

    let frameOrErrorElem = await page.waitForSelector(
      "#loginForm #status, #duo_iframe > iframe",
      { visible: true }
    );
    let isError = await frameOrErrorElem.evaluate(
      (elem) => elem.tagName !== "IFRAME"
    );
    if (isError) {
      let errorText = await frameOrErrorElem.evaluate((elem) =>
        elem.textContent.trim()
      );
      throw new Error(`CalNet login error: ${errorText}`);
    }

    let duoFrame = await page.waitForFrame(async (frame) => {
      let url = frame.url();
      if (!url) return false;
      let urlObj = new URL(url);
      if (!urlObj.hostname.endsWith(".duosecurity.com")) return false;
      if (!urlObj.pathname.startsWith("/frame/prompt")) return false;
      return true;
    });

    let duoDeviceName = config.get("calnet.duo.deviceName");
    if (!duoDeviceName)
      throw new Error(`Missing config option: calnet.duo.deviceName`);

    let deviceSelectElem = await duoFrame.waitForSelector(
      "#login-form .device-selector select",
      { visible: true }
    );
    let devices = {};
    for (let deviceOptionElem of await deviceSelectElem.$$("option")) {
      let label = await deviceOptionElem.evaluate((elem) => elem.textContent);
      let deviceID = await deviceOptionElem.evaluate((elem) => elem.value);
      let match = label.match(/^(.+?)(?: \(([^)]+)\))?$/);
      let deviceName = match[1];
      devices[deviceName] = deviceID;
    }
    let deviceID = devices[duoDeviceName];
    if (!deviceID) {
      throw new Error(
        `No Duo device named "${duoDeviceName}" found (available devices: [${Object.keys(
          devices
        ).join(", ")}])`
      );
    }
    await deviceSelectElem.select(deviceID);

    let passcodeBtnElem = await duoFrame.waitForSelector(
      `#auth_methods fieldset[data-device-index='${deviceID}'] button#passcode`,
      { visible: true }
    );
    await passcodeBtnElem.evaluate((elem) => elem.click());

    let token = generateDuoToken({ ...opts, config });
    let passcodeInputElem = await duoFrame.waitForSelector(
      `#auth_methods fieldset[data-device-index='${deviceID}'] input[name='passcode']`,
      { visible: true }
    );
    await passcodeInputElem.type(token);
    await passcodeInputElem.press("Enter");

    let messageElem = await duoFrame.waitForSelector(
      "#messages-view .message.error, #messages-view .message.success",
      { visible: true }
    );
    let messageTextElem = await messageElem.$(".message-text");
    let messageText = await messageTextElem.evaluate((elem) =>
      elem.textContent.trim()
    );
    isError = await messageElem.evaluate((elem) =>
      elem.classList.contains("error")
    );
    if (isError) {
      throw new Error(`Duo login error: ${messageText} (token: ${token})`);
    }
    if (messageText !== "Success! Logging you in...") {
      console.error(`Warning: Unknown Duo success message: ${messageText}`);
    }

    await page.waitForNavigation();
  }

  if (!check) return;
  if (typeof check !== "function") {
    let expectedURL = String(check);
    check = (url) => url === expectedURL;
  }
  let currentURL = page.url();
  if (!check(currentURL)) {
    throw new Error(`Login failed: unexpected URL: ${currentURL}`);
  }
}
