import UAParser from "ua-parser-js";
import UserAgent from "user-agents";

export const randomUserAgent = new UserAgent([
  { deviceCategory: "desktop" },
  (data) => {
    const res = new UAParser(data.userAgent).getResult();
    if (!["Chrome", "Firefox", "Safari"].includes(res.browser.name))
      return false;
    return true;
  },
]);

let puppeteer = null;

export async function withBrowser(cb, opts) {
  const { headful = false } = opts;

  if (!puppeteer) {
    const res = await import("puppeteer");
    puppeteer = res.default;
  }

  const browser = await puppeteer.launch({
    headless: !headful,
  });

  const pages = await browser.pages();
  const page = pages.length === 0 ? await browser.newPage() : pages[0];
  page.setDefaultTimeout(300000);

  let res;
  try {
    res = await cb({ browser, page });
  } catch (err) {
    try {
      await cleanup(browser);
    } catch (err2) {
      console.error(err2);
    }

    throw err;
  }
  await cleanup(browser);

  return res;
}

export async function cleanup(browser) {
  await browser.close();
}

export async function getCookieString(page, url) {
  const cookies = await page.cookies(url);
  return cookies.map(({ name, value }) => `${name}=${value}`).join("; ");
}

export async function getText(elem) {
  const text = await elem.evaluate((_elem) => _elem.textContent);
  return text.trim().replace(/\n\s+/g, "\n");
}

export async function skipURLs(frame, urls, maxRedirects = 10) {
  const urlObjs = urls.map((url) => new URL(url));
  for (let i = 0; i < maxRedirects; i++) {
    const currentURLObj = new URL(frame.url());
    const urlObj = urlObjs.find(
      (urlObj) =>
        currentURLObj.origin === urlObj.origin &&
        currentURLObj.pathname === urlObj.pathname
    );
    if (!urlObj) break;
    await frame.waitForNavigation();
  }
}

export async function waitForReady(frame, opts) {
  await frame.waitForFunction(() => {
    // eslint-disable-next-line no-undef
    if (document.readyState === "complete") return true;
  }, opts);
}

export async function waitForURL(frame, targetURLOrFunction, opts) {
  await frame.waitForFunction(
    (targetURLOrFunction) => {
      // eslint-disable-next-line no-undef
      const url = window.location.href;
      if (typeof targetURLOrFunction === "function") {
        const urlObj = new URL(url);
        return targetURLOrFunction(urlObj);
      }
      return url === String(targetURLOrFunction);
    },
    opts,
    targetURLOrFunction
  );
}
