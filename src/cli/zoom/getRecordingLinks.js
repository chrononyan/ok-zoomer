import Command from "../Command.js";

import * as browserUtils from "../../utils/browser.js";
import * as calnetUtils from "../../utils/calnet.js";
import * as zoomUtils from "../../utils/zoom.js";

const sub = new Command();

sub
  .name("get-recording-links")
  .description("batch-get Zoom recording share links")
  .option("-i, --input", "path to an input CSV")
  .action(async (opts) => {
    const cookieString = await browserUtils.withBrowser(async ({ page }) => {
      const recordingsURL = "https://berkeley.zoom.us/recording";
      await calnetUtils.gotoWithAuth(page, recordingsURL, {
        check: recordingsURL,
        configPath: opts.config,
        skipURLs: [
          "https://berkeley.zoom.us/saml/login",
          "https://shib.berkeley.edu/idp/profile/SAML2/POST/SSO",
        ],
      });

      return browserUtils.getCookieString(page, recordingsURL);
    }, opts);

    const recordings = await zoomUtils.getRecordings({
      ...opts,
      cookieString,
    });
    let i = 0;
    for (const recording of recordings) {
      const shareInfo = await zoomUtils.getRecordingShareInfo(
        recording.meetingID,
        {
          ...opts,
          cookieString,
        }
      );
      console.error(
        `[get-recording-links] fetched recording share info (topic: ${recording.topic}, link: ${shareInfo.link})`
      );
    }
  });

export default sub;
