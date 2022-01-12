import Command from "../Command.js";
import { getBorderCharacters, table } from "table";

import * as browserUtils from "../../utils/browser.js";
import * as calnetUtils from "../../utils/calnet.js";

const DEST_URL = "https://bpr.calnet.berkeley.edu/account-manager/";
const LOGIN_URL = "https://bpr.calnet.berkeley.edu/account-manager/login/index";

const sub = new Command();

sub
  .name("check")
  .description("check configured CalNet credentials")
  .action(async (opts) => {
    await browserUtils.withBrowser(async ({ page }) => {
      await calnetUtils.gotoWithAuth(page, LOGIN_URL, {
        check: DEST_URL,
        configPath: opts.config,
      });

      console.log("Successfully logged in!");

      const alertElem = await page.$(".content > .alert");
      if (alertElem) {
        const alertText = await browserUtils.getText(alertElem);
        if (
          alertText.includes(
            "Special Purpose Accounts cannot use this application"
          )
        ) {
          console.log("Detected a Special Purpose Account.");
        } else {
          throw new Error(`Unexpected login message: ${alertText}`);
        }
      } else {
        const rows = [];
        for (const rowElem of await page.$$(
          ".content .col-sm-9 fieldset > .row"
        )) {
          const labelElem = await rowElem.evaluateHandle(
            (elem) => elem.children[0]
          );
          const labelText = await browserUtils.getText(labelElem);
          const valueElem = await rowElem.evaluateHandle(
            (elem) => elem.children[1]
          );
          const valueText = await browserUtils.getText(valueElem);
          rows.push([labelText, valueText]);
          await labelElem.dispose();
          await valueElem.dispose();
        }
        console.log(
          table(rows, {
            border: getBorderCharacters("ramac"),
          })
        );
      }
    }, opts);
  });

export default sub;
