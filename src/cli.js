#!/usr/bin/env node

import { Command } from "commander";
import { parse as parseCSV } from "csv-parse";
import { stringify as stringifyCSV } from "csv-stringify";
import { createReadStream, createWriteStream, promises as fs } from "fs";
import puppeteer from "puppeteer";

const program = new Command();
program
  .option(
    "-i, --input <filename>",
    "Input CSV (requires column: Email)",
    "roster.csv"
  )
  .option("-o, --output <filename>", "Output CSV", "meetings.csv")
  .option("--cookies <filename>", "Cookies cache file", "cookies.json")
  .option(
    "-t, --topic <topic>",
    "Meeting topic (available substitutions: {email})",
    "Meeting ({email})"
  )
  .option(
    "--description <description>",
    "Meeting description (available substitutions: {email})"
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
  browser = await puppeteer.launch({ headless: false });
  page = (await browser.pages())[0] || (await browser.newPage());

  let authPage;
  try {
    const cookies = JSON.parse(await fs.readFile("cookies.json"));
    authPage = await browser.newPage();
    await authPage.goto("https://auth.berkeley.edu/cas/login");
    await authPage.setCookie(...cookies);
    await authPage.goto("https://berkeley.zoom.us");
    await authPage.setCookie(...cookies);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  console.log("Logging in...");
  await page.bringToFront();
  await page.goto("https://berkeley.zoom.us/meeting", {
    waitUntil: "domcontentloaded",
  });
  while (!page.url().startsWith("https://berkeley.zoom.us/meeting")) {
    await page.waitForNavigation();
  }
  console.log("Logged into Zoom");
  if (!authPage) authPage = await browser.newPage();
  await authPage.goto("https://auth.berkeley.edu/cas/login");
  let cookies = await authPage.cookies();
  await authPage.goto("https://berkeley.zoom.us");
  cookies = cookies.concat(await authPage.cookies());
  await fs.writeFile("cookies.json", JSON.stringify(cookies));
  await authPage.close();
}

async function scheduleMeeting(entry) {
  if (!page) await initBrowser();

  await page.goto("https://berkeley.zoom.us/meeting/schedule");

  if (options.topic) {
    const topicInput = await page.waitForSelector("input#topic", {
      visible: true,
    });
    await topicInput.click({ clickCount: 3 });
    await topicInput.press("Backspace");
    await topicInput.type(options.topic.replace(/\{email\}/g, entry.email));
  }
  if (options.description) {
    const descriptionInput = await page.waitForSelector("textarea#agenda", {
      visible: true,
    });
    await descriptionInput.click({ clickCount: 3 });
    await descriptionInput.press("Backspace");
    await descriptionInput.type(
      options.description.replace(/\{email\}/g, entry.email)
    );
  }
  {
    const recurringLabel = await page.waitForXPath(
      "//span[contains(@class, 'zm-checkbox')]//label[contains(., 'Recurring meeting')]",
      { visible: true }
    );
    const checked = await recurringLabel.$eval(
      "input",
      (elem) => elem.ariaChecked
    );
    if (checked !== "true")
      await page.evaluate((elem) => elem.click(), recurringLabel);
    const recurrenceInput = await page.waitForSelector("span#recurrence", {
      visible: true,
    });
    await page.evaluate((elem) => elem.click(), recurrenceInput);
    const noFixedTimeOption = await page.waitForSelector(
      "dd#select-item-recurrence-3",
      { visible: true }
    );
    await page.evaluate((elem) => elem.click(), noFixedTimeOption);
  }
  {
    const optionsButton = await page.waitForSelector(
      ".optional-options button",
      { visible: true }
    );
    const text = await page.evaluate((elem) => elem.innerText, optionsButton);
    if (text === "Show")
      await page.evaluate((elem) => elem.click(), optionsButton);
  }
  {
    const muteLabel = await page.waitForXPath(
      "//span[contains(@class, 'zm-checkbox')]//label[contains(., 'Mute participants upon entry')]",
      { visible: true }
    );
    const checked = await muteLabel.$eval("input", (elem) => elem.ariaChecked);
    if (checked === "true")
      await page.evaluate((elem) => elem.click(), muteLabel);
  }
  {
    const autoRecLabel = await page.waitForXPath(
      "//span[contains(@class, 'zm-checkbox')]//label[contains(., 'Automatically record meeting')]",
      { visible: true }
    );
    const checked = await autoRecLabel.$eval(
      "input",
      (elem) => elem.ariaChecked
    );
    if (checked !== "true")
      await page.evaluate((elem) => elem.click(), autoRecLabel);
    const autoRecCloudLabel = await page.waitForXPath(
      "//span[contains(@class, 'zm-radio')]//label[contains(., 'In the cloud')]",
      { visible: true }
    );
    await page.evaluate((elem) => elem.click(), autoRecCloudLabel);
  }
  {
    const altHostsInput = await page.waitForXPath("//div[contains(@class, 'optional-options')]//input[@aria-label='Alternative Hosts,Enter username or email addresses']");
    await altHostsInput.type(entry.email);
    const altHostOption = await page.waitForXPath(
      "//div[contains(@class, 'optional-options')]//dd[contains(@class, 'zm-select-dropdown__item')]"
    );
    let altHostOptionClasses = await page.evaluate((elem) => elem.className, altHostOption);
    if (altHostOptionClasses.includes("disabled") || !altHostOptionClasses.includes("option-item")) throw new Error(`Cannot add ${entry.email} as an alternate host`);
    let altHostOptionText = await page.evaluate((elem) => elem.textContent, altHostOption);
    if (!altHostOptionText.includes(entry.email)) throw new Error(`Cannot enter ${entry.email} as an alternate host`);
    await page.evaluate((elem) => elem.click(), altHostOption);
  }
  {
    await page.$$eval(
      "xpath/.//div[contains(@class, 'zm-sticky')]//button[contains(., 'Save') and not(@disabled)]",
      (elems) => elems.forEach((elem) => elem.click())
    );
  }
  await page.waitForNavigation();
  let link;
  {
    const linkElem = await page.waitForXPath(
      "//div[contains(@class, 'form-group')]//span[contains(., 'https://berkeley.zoom.us/j/')]"
    );
    link = await page.evaluate((elem) => elem.textContent.trim(), linkElem);
  }
  let passcode;
  {
    const passcodeElem = await page.waitForSelector("#displayPassword");
    passcode = await page.evaluate(
      (elem) => elem.textContent.trim(),
      passcodeElem
    );
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
