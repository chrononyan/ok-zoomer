let browser = null;
let puppeteer = null;

export async function spawnPage() {
  if (!browser) {
    if (!puppeteer) {
      let res = await import("puppeteer");
      puppeteer = res.default;
    }

    browser = await puppeteer.launch({
      headless: false,
    });
  }

  const page = await browser.newPage();
  page.setDefaultTimeout(300000);

  return page;
}

export async function cleanup() {
  await browser.close();
}

export async function getText(elem) {
  let text = await elem.evaluate((_elem) => _elem.textContent);
  return text.trim().replace(/\n\s+/g, "\n");
}
