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
    storageState: authFile,
    viewport: { width: 1600, height: 1200 },
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
  await page.getByRole('link', { name: '전자(세금)계산서 건별발급' }).click();

  await page.waitForTimeout(2000); // wait for 2 seconds to ensure the page is fully loaded

  console.log('Filling out invoice form...');
  await page.getByRole('textbox', { name: '등록번호' }).fill('1498100925');
  await page.getByRole('button', { name: '확인' }).click();
  await page.waitForTimeout(500);

  //await page.getByTitle('상호입력').fill('주식회사 드론맵');
  await page.locator('#mf_txppWframe_edtDmnrTnmNmTop').fill('주식회사 드론맵');
  //await page.getByTitle('성명 입력').fill('박동희');
  await page.locator('#mf_txppWframe_edtDmnrRprsFnmTop').fill('박동희');
  await page.getByTitle('사업장주소입력').fill('서울시 구로구 부일로 15가길 3 나동 401호');
  await page.getByTitle('업태입력', { exact: true }).fill('서비스');
  //await page.getByTitle('종목 입력').fill('소프트웨어 및 하드웨어');
  await page.locator('#mf_txppWframe_edtDmnrItmNmTop').fill('소프트웨어 및 하드웨어');
  await page.locator('#mf_txppWframe_edtDmnrMchrgEmlIdTop').fill('dongheepark0');
  await page.locator('#mf_txppWframe_edtDmnrMchrgEmlDmanTop').fill('gmail.com');
  await page.locator('#mf_txppWframe_edtDmnrSchrgEmlIdTop').fill('dongheepark1');
  await page.locator('#mf_txppWframe_edtDmnrSchrgEmlDmanTop').fill('gmail.com');

  // 작성일자
  await page.getByRole('button', { name: 'Calendar' }).click();
  await page.getByRole('button', { name: 'TodayToday' }).click();
  await page.getByRole('textbox', { name: '1행 일' }).click();
  await page.getByRole('textbox', { name: '1행 일' }).fill('1');
  await page.getByRole('textbox', { name: '1행 품목' }).click();
  await page.getByRole('textbox', { name: '1행 품목' }).fill('F450 드론');
  await page.getByRole('textbox', { name: '1행 수량' }).click();
  await page.getByRole('textbox', { name: '1행 수량' }).fill('1');
  await page.getByRole('textbox', { name: '1행 단가' }).click();
  await page.getByRole('textbox', { name: '1행 단가' }).fill('5000');

  await page.getByRole('button', { name: '발급미리보기' }).click();
  //await page.getByRole('button', { name: '취소' }).click();

  await context.storageState({ path: authFile });

  // do not occour timeout event, wait for eternally
  //await page.waitForTimeout(999999999);
  //await page.pause();
  //await page.getByRole('link', { name: '로그아웃' }).click();
  //await page.getByRole('button', { name: '확인' }).click();

  // Cleanup
  //await browser.close();
})();
