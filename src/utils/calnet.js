import { URI as OTPURI } from "otpauth";

import * as browserUtils from "./browser.js";
import { loadConfig, saveConfig } from "../config.js";

export function generateDuoToken(opts = {}) {
  const { configPath } = opts;
  let { config } = opts;

  if (!config) {
    config = loadConfig(configPath);
  }
  const uri = config.get("calnet.duo.otpURI");
  if (!uri) throw new Error(`Missing config option: calnet.duo.otpURI`);

  const hotp = OTPURI.parse(uri);
  const token = hotp.generate();
  config.set("calnet.duo.otpURI", hotp.toString());
  saveConfig(configPath);

  return token;
}

export async function gotoWithAuth(page, url, opts = {}) {
  const { configPath, manual2FA = false, retries = 3, skipURLs = [] } = opts;
  let { check, config } = opts;

  await page.goto(url);
  await browserUtils.skipURLs(page, skipURLs);

  const currentURLObj = new URL(page.url());
  if (currentURLObj.href.startsWith("https://auth.berkeley.edu/cas/login")) {
    console.error("[calnet] entering credentials");

    if (!config) {
      config = loadConfig(configPath);
    }

    const username = config.get("calnet.username");
    if (!username) throw new Error(`Missing config option: calnet.username`);
    const password = config.get("calnet.password");
    if (!password) throw new Error(`Missing config option: calnet.password`);

    const usernameElem = await page.waitForSelector(
      "#loginForm input#username",
      {
        visible: true,
      }
    );
    await usernameElem.type(username);

    const passwordElem = await page.waitForSelector(
      "#loginForm input#password",
      {
        visible: true,
      }
    );
    await passwordElem.type(password);
    await passwordElem.press("Enter");

    const frameOrErrorElem = await page.waitForSelector(
      "#loginForm #status, #duo_iframe > iframe",
      { visible: true }
    );
    let isError = await frameOrErrorElem.evaluate(
      (elem) => elem.tagName !== "IFRAME"
    );
    if (isError) {
      const errorText = await frameOrErrorElem.evaluate((elem) =>
        elem.textContent.trim()
      );
      throw new Error(`CalNet login error: ${errorText}`);
    }

    let token = null;
    if (manual2FA) {
      console.error("[calnet] waiting for manual 2FA");
    } else {
      console.error("[calnet] entering 2FA code");

      const duoFrame = await page.waitForFrame(async (frame) => {
        const url = frame.url();
        if (!url) return false;
        const urlObj = new URL(url);
        if (!urlObj.hostname.endsWith(".duosecurity.com")) return false;
        if (!urlObj.pathname.startsWith("/frame/prompt")) return false;
        return true;
      });

      const duoDeviceName = config.get("calnet.duo.deviceName");
      if (!duoDeviceName)
        throw new Error(`Missing config option: calnet.duo.deviceName`);

      const deviceSelectElem = await duoFrame.waitForSelector(
        "#login-form .device-selector select",
        { visible: true }
      );
      const devices = {};
      for (const deviceOptionElem of await deviceSelectElem.$$("option")) {
        const label = await deviceOptionElem.evaluate(
          (elem) => elem.textContent
        );
        const deviceID = await deviceOptionElem.evaluate((elem) => elem.value);
        const match = label.match(/^(.+?)(?: \(([^)]+)\))?$/);
        const deviceName = match[1];
        devices[deviceName] = deviceID;
      }
      const deviceID = devices[duoDeviceName];
      if (!deviceID) {
        throw new Error(
          `No Duo device named "${duoDeviceName}" found (available devices: [${Object.keys(
            devices
          ).join(", ")}])`
        );
      }
      await deviceSelectElem.select(deviceID);

      const passcodeBtnElem = await duoFrame.waitForSelector(
        `#auth_methods fieldset[data-device-index='${deviceID}'] button#passcode`,
        { visible: true }
      );
      await passcodeBtnElem.evaluate((elem) => elem.click());

      token = generateDuoToken({ ...opts, config });
      const passcodeInputElem = await duoFrame.waitForSelector(
        `#auth_methods fieldset[data-device-index='${deviceID}'] input[name='passcode']`,
        { visible: true }
      );
      await passcodeInputElem.type(token);
      await passcodeInputElem.press("Enter");
    }

    const maybeMessageElem = await page.waitForFunction(
      () => {
        // eslint-disable-next-line no-undef
        if (!document.querySelector("#duo_iframe > iframe")) return true;
        // eslint-disable-next-line no-undef
        return document.querySelector(
          "#messages-view .message.error, #messages-view .message.success"
        );
      },
      { timeout: manual2FA ? 0 : undefined }
    );
    const messageElem = maybeMessageElem.asElement();
    if (messageElem !== null) {
      const messageTextElem = await messageElem.$(".message-text");
      const messageText = await messageTextElem.evaluate((elem) =>
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
    }

    console.error("[calnet] logged in");

    if (page.url() === currentURLObj.href) {
      await page.waitForNavigation();
    } else {
      await browserUtils.waitForReady(page);
    }
  }

  await browserUtils.skipURLs(page, skipURLs);

  if (!check) return;
  if (typeof check !== "function") {
    const expectedURL = String(check);
    check = (actualURL) => actualURL === expectedURL;
  }
  const currentURL = page.url();
  if (!check(currentURL)) {
    if (retries > 0) {
      console.error(`Retrying failed login: unexpected URL: ${currentURL}`);
      return gotoWithAuth(page, url, { ...opts, retries: retries - 1 });
    }
    throw new Error(`Login failed: unexpected URL: ${currentURL}`);
  }
}
