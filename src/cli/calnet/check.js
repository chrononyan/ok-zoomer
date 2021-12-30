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
    const page = await browserUtils.spawnPage();

    try {
      await calnetUtils.gotoWithAuth(page, LOGIN_URL, {
        check: DEST_URL,
        configPath: opts.config,
      });

      console.log("Successfully logged in!");

      let alertElem = await page.$(".content > .alert");
      if(alertElem) {
        let alertText = await browserUtils.getText(alertElem);
        if(alertText.includes("Special Purpose Accounts cannot use this application")) {
          console.log("Detected a Special Purpose Account.");
        } else {
          throw new Error(`Unexpected login message: ${alertText}`);
        }
      } else {
        let rows = [];
        for(let rowElem of await page.$$(".content .col-sm-9 fieldset > .row")) {
          let labelElem = await rowElem.evaluateHandle((elem) => elem.children[0]);
          let labelText = await browserUtils.getText(labelElem);
          let valueElem = await rowElem.evaluateHandle((elem) => elem.children[1]);
          let valueText = await browserUtils.getText(valueElem);
          rows.push([labelText, valueText]);
        }
        console.log(table(rows, {
          border: getBorderCharacters("ramac"),
        }));
      }
    } catch (err) {
      try {
        await browserUtils.cleanup();
      } catch (err2) {
        console.error(err2);
      }

      throw err;
    }

    await browserUtils.cleanup();
  });

export default sub;
