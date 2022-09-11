import { URI as OTPURI } from "otpauth";

import * as browserUtils from "./browser.js";
import { loadConfig, saveConfig } from "../config.js";

import sleep from "./sleep.js"

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

    const authOrErrorElem = await page.waitForSelector(
      "#loginForm #status, #auth-view-wrapper .other-options-link > a",
      { visible: true }
    );
    let isError = await authOrErrorElem.evaluate(
      (elem) => elem.id === "status"
    );
    if (isError) {
      const errorText = await authOrErrorElem.evaluate((elem) =>
        elem.textContent.trim()
      );
      throw new Error(`CalNet login error: ${errorText}`);
    }

    let token = null;
    if (manual2FA) {
      console.error("[calnet] waiting for manual 2FA");
    } else {
      console.error("[calnet] entering 2FA code");

      await authOrErrorElem.evaluate((elem) => elem.click());
    await sleep(3000000)

      const duoDeviceName = config.get("calnet.duo.deviceName");
      if (!duoDeviceName)
        throw new Error(`Missing config option: calnet.duo.deviceName`);

      const authMethodListElem = await page.waitForSelector(
        ".all-auth-methods .other-options-list",
        { visible: true }
      );
      const authMethods = [];
      let foundAuthMethod = false;
      for (const authMethodElem of await authMethodListElem.$$("li > a")) {
        const authMethodLabel = await authMethodElem.evaluate(
          (elem) => elem.querySelector(".method-label").textContent
        );
        console.log("label", authMethodLabel)
        if (authMethodLabel === "Duo Mobile passcode") {
          foundAuthMethod = true;
          let promptURL = await authMethodElem.evaluate((elem) => elem.href);
          console.log(promptURL)
          await page.goto(promptURL);
          break;
        }
        const authMethodDescription = await authMethodElem.evaluate(
          (elem) => elem.querySelector(".method-description").textContent.trim()
        );
        authMethods.push(`${authMethodLabel}: ${authMethodDescription}`);
      }
      if (!foundAuthMethod) {
        throw new Error(
          `No option for mobile passcode (available auth methods: [${authMethods.join(", ")}])`
        );
      }

      token = generateDuoToken({ ...opts, config });
      const passcodeInputElem = await page.waitForSelector(
        `#auth-view-wrapper #passcode-input`,
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
