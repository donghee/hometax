import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '.env') });
const authFile = path.join(__dirname, 'user.json');
const userDataDir = path.join(__dirname, 'google-chrome');

const certName = process.env.CERT_NAME!;
const certPassword = process.env.CERT_PASSWORD!;

const logout = async (page) => {
  await page.getByRole('link', { name: '로그아웃', exact: true }).click();
  await page.getByRole('button', { name: '확인',exact: true }).click();
  console.log('Logged out successfully');
}

const login = async (page) => {
  await page.goto('https://hometax.go.kr');
  await page.waitForLoadState('networkidle');

  // if logined, skip login process
  if (await page.getByRole('link', { name: '로그아웃', exact: true }).isVisible()) {
    console.log('Already logged in, skipping login process');
    return;
  //   logout(page);
  //   console.log('Logged out successfully');
  //   await page.goto('https://hometax.go.kr');
  //   await page.waitForLoadState('networkidle');
  }

  await page.getByRole('link', { name: '로그인', exact: true }).click();
  await page.getByRole('button', { name: '공동·금융인증서' }).click();

  //await page.locator('iframe[name="dscert"]').contentFrame().getByRole('link', { name: '하드디스크 이동식' }).click();
  //await page.locator('iframe[name="dscert"]').contentFrame().getByRole('link', { name: '하드디스크 이동식' }).click();
  //await page.locator('iframe[name="dscert"]').contentFrame().getByRole('link', { name: '로컬 디스크 (C)' }).click();

  await page.locator('iframe[name="dscert"]').contentFrame().getByRole('link', { name: '브라우저' }).click();

  // eunpa
  await page.locator('iframe[name="dscert"]').contentFrame().locator('a').filter({ hasText: certName }).click();
  //await page.locator('iframe[name="dscert"]').contentFrame().getByRole('textbox', { name: '비밀번호 입력' }).click(); // do not click, just fill to prevent popup screen keyboard
  await page.locator('iframe[name="dscert"]').contentFrame().getByRole('textbox', { name: '비밀번호 입력' }).fill(certPassword);
  await page.locator('iframe[name="dscert"]').contentFrame().getByRole('textbox', { name: '비밀번호 입력' }).press('Enter');

  // timeout 2s
  await page.waitForTimeout(2000);
}

(async () => {
  const context = await chromium.launchPersistentContext(userDataDir, { 
    channel: "chrome",
    headless: false,
    permissions: ['local-network-access'],
    storageState: authFile
    }
  );
  await context.setDefaultTimeout(60000 * 60); // Set default timeout to 60 minutes
  const page = await context.newPage();
  console.log('Browser launched, trying to log in...');
  await login(page);

  // still iframe is popuped and not loggined, close and retry
  while (await page.locator('iframe[name="dscert"]').isVisible() && ! await page.getByRole('link', { name: '로그아웃',exact: true }).isVisible()) {
    console.log('Login iframe still visible, closing and retrying login...');
    await page.locator('iframe[name="dscert"]').evaluate((frame) => {
      frame.remove();
    });
    await login(page);
  }

  console.log('Login successful, navigating to copy invoice page...');
  await page.getByRole('link', { name: '계산서·영수증·카드' }).click();

  await page.getByRole('link', { name: '반복/복사 발급' }).click();
  await page.getByRole('link', { name: '전자(세금)계산서 복사발급' }).click();
  await page.getByRole('button', { name: '2개월' }).click();
  await page.getByRole('button', { name: '조회' }).click();

  await context.storageState({ path: authFile });

  // do not occour timeout event, wait for eternally
  //await page.waitForTimeout(999999999);
  //await page.pause();
  //await page.getByRole('link', { name: '로그아웃' }).click();
  //await page.getByRole('button', { name: '확인' }).click();

  // Cleanup
  //await browser.close();
})();
