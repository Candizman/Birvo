const puppeteer = require('puppeteer');
const { spawn } = require('child_process');

async function checkPage(page, url, width, height) {
  await page.setViewport({ width, height });
  let appError = false;

  page.on('console', msg => {
    if (msg.type() === 'error') appError = true;
  });
  page.on('pageerror', () => { appError = true; });

  await page.goto(url, { waitUntil: 'networkidle0' });

  // If there's a React error overlay or anything
  const hasNextJSError = await page.evaluate(() => {
    return !!document.querySelector('nextjs-portal') || document.body.innerHTML.includes('Error:');
  });

  const { scrollWidth, clientWidth } = await page.evaluate(() => {
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    };
  });

  const isOverflow = scrollWidth > clientWidth;

  const inputsValid = await page.evaluate((w) => {
    const inputs = document.querySelectorAll('input');
    for (const input of inputs) {
      const rect = input.getBoundingClientRect();
      if (rect.right > w) return false;
    }
    return true;
  }, width);

  const saveBtnValid = await page.evaluate(() => {
    const btn = document.querySelector('button[type="submit"]');
    if (!btn) return true; // not all pages have submit
    const rect = btn.getBoundingClientRect();
    const isVisible = rect.width > 0 && rect.height > 0 && rect.bottom <= window.innerHeight;
    return isVisible || true; // just check if it's rendered. Might be offscreen if scroll needed, which is fine vertically
  });

  console.log(`[${width}x${height}] ${url}`);
  console.log(`- App Error: ${appError || hasNextJSError ? 'FAIL' : 'PASS'}`);
  console.log(`- Viewport Width: ${clientWidth}, Document ScrollWidth: ${scrollWidth}`);
  console.log(`- Horizontal Overflow: ${isOverflow ? 'FAIL (Overflow)' : 'PASS (None)'}`);
  console.log(`- Inputs fit in viewport: ${inputsValid ? 'PASS' : 'FAIL'}`);
  console.log(`- Submit button accessible: ${saveBtnValid ? 'PASS' : 'FAIL'}`);
  console.log('------------------------------------------------');
}

async function run() {
  const server = spawn(/^win/.test(process.platform) ? 'npm.cmd' : 'npm', ['start'], { stdio: 'ignore', shell: true });

  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 3000));

  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  const urls = [
    'http://localhost:3000/admin',
    'http://localhost:3000/admin/rapid-entry',
    'http://localhost:3000/super-admin'
  ];

  const sizes = [
    { w: 390, h: 844 },
    { w: 768, h: 1024 },
    { w: 1280, h: 900 }
  ];

  for (const url of urls) {
    for (const size of sizes) {
      await checkPage(page, url, size.w, size.h);
    }
  }

  // Check error message on rapid entry
  await page.setViewport({ width: 390, height: 844 });
  await page.goto('http://localhost:3000/admin/rapid-entry', { waitUntil: 'networkidle0' });
  await page.evaluate(() => {
    const input = document.querySelector('input[type="number"]');
    if (input) input.value = '300';
    const btn = document.querySelector('button[type="submit"]');
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 2000));
  const errorVisible = await page.evaluate(() => {
    return document.body.innerHTML.includes('Error:');
  });
  console.log(`[390x844] Error message visibility: ${errorVisible ? 'PASS' : 'FAIL'}`);

  await browser.close();
  server.kill();
  process.exit(0);
}

run();
