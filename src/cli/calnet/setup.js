import Command from "../Command.js";
import prompts from "prompts";

import * as browserUtils from "../../utils/browser.js";
import * as calnetUtils from "../../utils/calnet.js";
import * as duoUtils from "../../utils/duo.js";
import { loadConfig, saveConfig } from "../../config.js";

const MANAGE_2FA_URL =
  "https://bpr.calnet.berkeley.edu/account-manager/twoStepVerification/manage";

const sub = new Command();

sub
  .name("setup")
  .description("set up CalNet auth for `ok-zoomer` (interactive)")
  .action(async (opts) => {
    const res = await prompts([
      {
        type: "text",
        name: "username",
        message: "CalNet username:",
      },
      {
        type: "password",
        name: "password",
        message: "CalNet password:",
      },
      {
        type: "text",
        name: "deviceName",
        message: "Duo device name:",
        initial: "ok-zoomer",
      },
    ]);
    const deviceName = res.deviceName.trim();
    const config = loadConfig(opts.config);
    config.set("calnet.username", res.username);
    config.set("calnet.password", res.password);

    await browserUtils.withBrowser(
      async ({ page }) => {
        await calnetUtils.gotoWithAuth(page, MANAGE_2FA_URL, {
          check: MANAGE_2FA_URL,
          config: config,
          manual2FA: true,
        });

        const frameElem = await page.waitForSelector("#duo_iframe", {
          visible: true,
        });
        const duoFrame = await frameElem.contentFrame();

        console.log("Waiting for manual 2FA (again)");

        const addDeviceBtnElem = await duoFrame.waitForSelector(
          ".add-another-device #another-device",
          { visible: true }
        );
        await addDeviceBtnElem.evaluate((elem) => elem.click());

        console.log("Enrolling new 2FA device");

        const tabletFlowInputElem = await duoFrame.waitForSelector(
          `#flow-form input[name='flow'][value='tablet']`,
          { visible: true }
        );
        await tabletFlowInputElem.evaluate((elem) => elem.click());
        const continueFlowBtnElem = await duoFrame.waitForSelector(
          "#flow-form #continue:not([disabled])",
          { visible: true }
        );
        await continueFlowBtnElem.evaluate((elem) => elem.click());

        let didClick = false;
        while (!didClick) {
          const androidPlatformInputElem = await duoFrame.waitForSelector(
            `#install-mobile-app-form input[name='platform'][value='Android']`,
            { visible: true }
          );
          await androidPlatformInputElem.evaluate(
            (elem) => (elem.checked = false)
          );
          await androidPlatformInputElem.evaluate((elem) => elem.click());
          try {
            const continuePlatformBtnElem = await duoFrame.waitForSelector(
              ".base-body .btn-wrapper button#continue:not([disabled])",
              { timeout: 100, visible: true }
            );
            await continuePlatformBtnElem.evaluate((elem) => elem.click());
            didClick = true;
          } catch (err) {
            if (err.name !== "TimeoutError") throw err;
          }
        }

        const continueInstalledBtnElem = await duoFrame.waitForSelector(
          "#install-mobile-app #duo-installed:not([disabled])"
        );
        await continueInstalledBtnElem.evaluate((elem) => elem.click());

        const qrImageElem = await duoFrame.waitForSelector(
          "#qr-mobile-app-activation .qr-container img.qr",
          { visible: true }
        );
        const qrImageSrc = await (
          await qrImageElem.getProperty("src")
        ).jsonValue();
        const qrImageURLObj = new URL(qrImageSrc, duoFrame.url());
        const qrString = qrImageURLObj.searchParams.get("value");
        if (qrImageURLObj.pathname !== "/frame/qr" || !qrString) {
          throw new Error(`Unknown QR image src: ${qrImageSrc}`);
        }
        console.log("Activating new 2FA device");
        const { data: activationData, hotp } = await duoUtils.activateDevice(
          qrString
        );
        console.log(`HOTP URI: ${hotp.toString()}`);
        console.log(`Device Key: ${activationData.pkey}`);
        config.set("calnet.duo.otpURI", hotp.toString());

        console.log("Renaming new 2FA device");
        const continueActivationBtnElem = await duoFrame.waitForSelector(
          "#qr-mobile-app-activation #continue:not([disabled])",
          { visible: true }
        );
        await continueActivationBtnElem.evaluate((elem) => elem.click());

        const deviceBarElem = (
          await duoFrame.waitForFunction(
            async (pkey) => {
              // eslint-disable-next-line no-undef
              const deviceBarElems = document.querySelectorAll(
                "#manage-devices .device-bar"
              );
              for (const deviceBarElem of deviceBarElems) {
                const inputElem =
                  deviceBarElem.querySelector("input[name='pkey']");
                if (!inputElem) continue;
                console.log(inputElem, inputElem.value, pkey);
                if (inputElem.value !== pkey) continue;
                return deviceBarElem;
              }
            },
            {},
            activationData.pkey
          )
        ).asElement();
        didClick = false;
        while (!didClick) {
          const deviceOptionsBtnElem = await deviceBarElem.waitForSelector(
            "#device-options:not([disabled])"
          );
          await deviceOptionsBtnElem.evaluate((elem) => elem.click());
          try {
            const deviceNameChangeBtnElem = await deviceBarElem.waitForSelector(
              "button.change-device-name:not([disabled])",
              { timeout: 100, visible: true }
            );
            await deviceNameChangeBtnElem.evaluate((elem) => elem.click());
            didClick = true;
          } catch (err) {
            if (err.name !== "TimeoutError") throw err;
          }
        }
        const deviceNameInputElem = await deviceBarElem.waitForSelector(
          ".edit-name-container input[name='pname']",
          { visible: true }
        );
        await deviceNameInputElem.evaluate((elem) => (elem.value = ""));
        await deviceNameInputElem.type(deviceName);
        const deviceNameSaveBtnElem = await deviceBarElem.waitForSelector(
          ".options-menu button.edit-submit:not([disabled])",
          { visible: true }
        );
        await deviceNameSaveBtnElem.evaluate((elem) => elem.click());

        const deviceNameElem = await deviceBarElem.waitForSelector(
          ".device-name .visible-name",
          { visible: true }
        );
        const actualDeviceName = await browserUtils.getText(deviceNameElem);
        if (actualDeviceName !== deviceName) {
          console.error(
            `Warning: tried to rename device to ${deviceName}, but got ${actualDeviceName}`
          );
        }
        config.set("calnet.duo.deviceName", deviceName);
      },
      { ...opts, headful: true }
    );

    saveConfig(opts.config);
    console.log("Saved to config");

    console.log("Setup completed! Run the `calnet check` subcommand to check.");
  });

export default sub;
