#!/usr/bin/env node

import { Command } from "commander";
import { parse as parseCSV } from "csv-parse";
import { stringify as stringifyCSV } from "csv-stringify";
import { createReadStream, createWriteStream, promises as fs } from "fs";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import AnonymizeUAPlugin from "puppeteer-extra-plugin-anonymize-ua";

puppeteer.use(AnonymizeUAPlugin());
puppeteer.use(StealthPlugin());

const program = new Command();
program
  .option(
    "-i, --input <filename>",
    "Input CSV (requires column: Email)",
    "roster.csv",
  )
  .option("-o, --output <filename>", "Output CSV", "meetings.csv")
  .option("--cookies <filename>", "Cookies cache file", "cookies.json")
  .option("--template-id <templateId>", "Meeting template ID", null)
  .option(
    "--topic <topic>",
    "Meeting topic (available substitutions: {email})",
    "Meeting ({email})",
  )
  .option(
    "--description <description>",
    "Meeting description (available substitutions: {email})",
  )
  .parse();

const options = program.opts();

const entries = {};
{
  const inputStream = createReadStream(options.input).pipe(parseCSV());
  let headerRow;
  let emailColIndex = -1;
  for await (const row of inputStream) {
    if (!headerRow) {
      headerRow = row;
      emailColIndex = headerRow.findIndex((cell) => /\bemail\b/i.test(cell));
      if (emailColIndex === -1)
        throw new Error("Missing email column in input CSV");
      continue;
    }
    const email = row[emailColIndex];
    entries[email] = {
      email: email,
      link: null,
      passcode: null,
    };
  }
}
console.log(`Found ${Object.keys(entries).length} roster entries`);
try {
  await fs.access(options.output, fs.F_OK);
  const outputReadStream = createReadStream(options.output).pipe(parseCSV());
  let headerRow;
  let skipCount = 0;
  for await (const row of outputReadStream) {
    if (!headerRow) {
      headerRow = row;
      if (
        headerRow[0] !== "email" ||
        headerRow[1] !== "link" ||
        headerRow[2] !== "passcode"
      )
        throw new Error("Invalid output CSV");
      continue;
    }
    const email = row[0];
    entries[email].link = row[1];
    entries[email].passcode = row[2];
    skipCount++;
  }
  if (skipCount)
    console.log(`Skipping ${skipCount} entries with existing links`);
} catch (err) {
  if (err.code !== "ENOENT") throw err;
}

let browser;
let page;
async function initBrowser() {
  browser = await puppeteer.launch({
    defaultViewport: null,
    headless: false,
  });
  page = (await browser.pages())[0] || (await browser.newPage());

  let authPage;
  try {
    const cookies = JSON.parse(await fs.readFile("cookies.json"));
    authPage = await browser.newPage();
    if (cookies.calnet) {
      await authPage.goto("https://auth.berkeley.edu/cas/login");
      await authPage.setCookie(...cookies.calnet);
    }
    if (cookies.duo && cookies.duoUrl) {
      await authPage.goto(cookies.duoUrl);
      await authPage.setCookie(...cookies.duo);
    }
    if (cookies.zoom) {
      await authPage.goto("https://berkeley.zoom.us");
      await authPage.setCookie(...cookies.zoom);
    }
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  console.log("Logging in...");
  await page.bringToFront();
  await page.goto("https://berkeley.zoom.us/meeting", {
    waitUntil: "domcontentloaded",
  });
  let duoUrl = null;
  while (!page.url().startsWith("https://berkeley.zoom.us/meeting")) {
    if (page.url().includes("duosecurity.com")) {
      duoUrl = page.url();
      console.log(`Found Duo URL: ${duoUrl}`);
    }
    await page.waitForNavigation({ timeout: 0 });
  }
  console.log("Logged into Zoom");
  if (!authPage) authPage = await browser.newPage();
  const cookies = {
    calnet: null,
    duo: null,
    duoUrl: duoUrl,
    zoom: null,
  };
  await authPage.goto("https://auth.berkeley.edu/cas/login");
  cookies.calnet = await authPage.cookies();
  if (duoUrl) {
    await authPage.goto(duoUrl);
    cookies.duo = await authPage.cookies();
  }
  await authPage.goto("https://berkeley.zoom.us");
  cookies.zoom = await authPage.cookies();
  await fs.writeFile("cookies.json", JSON.stringify(cookies));
  await authPage.close();

  await page.evaluateOnNewDocument(() => {
    setTimeout(() => {
      console.log("Injecting styles", document.head);
      const style = document.createElement("style");
      style.type = "text/css";
      style.innerHTML = `
        html, body {
          height: unset !important;
        }
      `;
      document.head.appendChild(style);
    }, 0);

    setTimeout(() => {
      console.log("Blocking ancient Kaltura alert");
      const alert = document.querySelector(".small-notice.alert-warning");
      if (
        alert &&
        alert.innerText.includes(
          "Starting 1/6/2021, if you enable Zoom Cloud Recordings",
        )
      ) {
        alert.parentNode.remove();
      }
    }, 0);
  });
}

async function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function scrollToBottom() {
  let prevScrollHeight = null;
  while (
    window.scrollTop < window.scrollHeight - window.clientHeight - 100 ||
    prevScrollHeight === null ||
    window.scrollHeight !== prevScrollHeight
  ) {
    if (prevScrollHeight !== null) await sleep(250);
    prevScrollHeight = window.scrollHeight;
  }
}

async function setCheckbox(wrapperElem, isChecked) {
  const checked = await wrapperElem.$eval("input", (elem) => elem.ariaChecked);
  if (checked !== String(isChecked))
    await page.evaluate((elem) => elem.click(), wrapperElem);
}

async function scheduleMeeting(entry) {
  if (!page) await initBrowser();

  await page.goto(
    options.templateId
      ? `https://berkeley.zoom.us/meeting/template/${options.templateId}/schedule`
      : "https://berkeley.zoom.us/meeting/schedule",
  );

  await page.evaluate(scrollToBottom);
  if (options.topic) {
    console.log("Setting: topic");
    const topicInput = await page.waitForSelector("input#topic");
    await topicInput.click({ clickCount: 3 });
    await topicInput.press("Backspace");
    await topicInput.type(options.topic.replace(/\{email\}/g, entry.email));
  }
  if (options.description) {
    console.log("Setting: description");
    const descriptionButton = await page.waitForSelector("button.agenda-btn");
    await page.evaluate((elem) => elem.click(), descriptionButton);
    const descriptionInput = await page.waitForSelector("textarea#agenda");
    await descriptionInput.click({ clickCount: 3 });
    await descriptionInput.press("Backspace");
    await descriptionInput.type(
      options.description.replace(/\{email\}/g, entry.email),
    );
  }
  await page.evaluate(scrollToBottom);
  if (!options.templateId) {
    {
      console.log("Setting: recurrence");
      const recurringLabel = await page.waitForXPath(
        "//span[contains(@class, 'zm-checkbox')]//label[contains(., 'Recurring meeting')]",
      );
      setCheckbox(recurringLabel, true);
      const recurrenceInput = await page.waitForSelector("#recurringType");
      await page.evaluate((elem) => elem.click(), recurrenceInput);
      const noFixedTimeOption = await page.waitForSelector(
        "#select-item-recurringType-3",
      );
      await page.evaluate((elem) => elem.click(), noFixedTimeOption);
    }
    await page.evaluate(scrollToBottom);
    {
      console.log("Setting: random meeting ID");
      const automaticMeetingIdLabel = await page.waitForXPath(
        "//span[contains(@class, 'zm-radio')]//label[contains(., 'Generate Automatically')]",
      );
      await page.evaluate((elem) => elem.click(), automaticMeetingIdLabel);
    }
    await page.evaluate(scrollToBottom);
    {
      console.log("Setting: security");
      const passwordSecurityLabel = await page.waitForXPath(
        "//div[@id='security']//span[contains(@class, 'zm-checkbox')]//label[contains(., 'Passcode')]",
      );
      setCheckbox(passwordSecurityLabel, false);
      const waitingRoomSecurityLabel = await page.waitForXPath(
        "//div[@id='security']//span[contains(@class, 'zm-checkbox')]//label[contains(., 'Waiting Room')]",
      );
      setCheckbox(waitingRoomSecurityLabel, false);
      const authSecurityLabel = await page.waitForXPath(
        "//div[@id='security']//span[contains(@class, 'zm-checkbox')]//label[contains(., 'Require authentication')]",
      );
      setCheckbox(authSecurityLabel, true);
    }
  }
  await page.evaluate(scrollToBottom);
  {
    console.log("Revealing additional options");
    const optionsButton = await page.waitForSelector(
      ".optional-options button",
    );
    const text = await page.evaluate((elem) => elem.innerText, optionsButton);
    if (text !== "Hide")
      await page.evaluate((elem) => elem.click(), optionsButton);
  }
  if (!options.templateId) {
    await page.evaluate(scrollToBottom);
    {
      console.log("Setting: join anytime");
      const joinAnytimeLabel = await page.waitForXPath(
        "//span[contains(@class, 'zm-checkbox')]//label[contains(., 'Allow participants to join')]",
      );
      await setCheckbox(joinAnytimeLabel, false);
    }
    {
      console.log("Setting: mute upon entry");
      const autoMuteLabel = await page.waitForXPath(
        "//span[contains(@class, 'zm-checkbox')]//label[contains(., 'Mute participants upon entry')]",
      );
      await setCheckbox(autoMuteLabel, false);
    }
    {
      console.log("Setting: auto record");
      const autoRecLabel = await page.waitForXPath(
        "//span[contains(@class, 'zm-checkbox')]//label[contains(., 'Automatically record meeting')]",
      );
      await setCheckbox(autoRecLabel, true);
      const autoRecCloudLabel = await page.waitForXPath(
        "//span[contains(@class, 'zm-radio')]//label[contains(., 'In the cloud')]",
      );
      await page.evaluate((elem) => elem.click(), autoRecCloudLabel);
    }
  }
  await page.evaluate(scrollToBottom);
  {
    console.log("Setting: alternative hosts");
    const altHostsInput = await page.waitForXPath(
      "//div[contains(@class, 'optional-options')]//input[@placeholder='Enter user name or email addresses']",
    );
    await altHostsInput.type(entry.email);
    const altHostOption = await page.waitForXPath(
      "//div[contains(@class, 'optional-options')]//dd[contains(@class, 'zm-select-dropdown__item')]",
    );
    const altHostOptionClasses = await page.evaluate(
      (elem) => elem.className,
      altHostOption,
    );
    if (
      altHostOptionClasses.includes("disabled") ||
      !altHostOptionClasses.includes("option-item")
    )
      throw new Error(`Cannot add ${entry.email} as an alternate host`);
    const altHostOptionText = await page.evaluate(
      (elem) => elem.textContent,
      altHostOption,
    );
    if (!altHostOptionText.includes(entry.email))
      throw new Error(`Cannot enter ${entry.email} as an alternate host`);
    await page.evaluate((elem) => elem.click(), altHostOption);
    await page.evaluate((elem) => elem.blur(), altHostsInput);
  }
  {
    console.log("Saving meeting");
    await page.$$eval(
      "xpath/.//div[contains(@class, 'zm-sticky')]//button[contains(., 'Save') and not(@disabled)]",
      (elems) => elems.forEach((elem) => elem.click()),
    );
  }
  await page.waitForNavigation();
  let link;
  {
    console.log("Finding meeting link");
    const linkElem = await page.waitForXPath(
      "//div[@id='registration']//a[contains(., 'https://berkeley.zoom.us/j/')]",
    );
    link = await page.evaluate((elem) => elem.textContent.trim(), linkElem);
  }
  let passcode;
  {
    console.log("Finding meeting passcode");
    const descriptionButton = await page.waitForSelector(
      ".security-info button",
    );
    if (descriptionButton) {
      await page.evaluate((elem) => elem.click(), descriptionButton);
      const passcodeElem = await page.waitForSelector(".security-info .mgl-sm");
      passcode = await page.evaluate(
        (elem) => elem.textContent.trim(),
        passcodeElem,
      );
    } else {
      passcode = "";
    }
  }

  entry.link = link;
  entry.passcode = passcode;
}

const outputStream = stringifyCSV({
  columns: ["email", "link", "passcode"],
  header: true,
});
const outputWriteStream = outputStream.pipe(createWriteStream(options.output));
for (const entry of Object.values(entries)) {
  if (!entry.link) continue;
  outputStream.write(entry);
}
for (const entry of Object.values(entries)) {
  if (entry.link) continue;
  if (!entry.link) {
    try {
      await scheduleMeeting(entry);
      console.log(`[${entry.email}] generated ${entry.link}`);
    } catch (err) {
      console.error(`[${entry.email}] ${err.stack}`);
      continue;
    }
  }
  if (!entry.link) continue;
  outputStream.write(entry);
}
outputStream.end();
outputWriteStream.once("finish", () => {
  console.log(`Finished writing to ${options.output}`);
});

if (browser) await browser.close();
