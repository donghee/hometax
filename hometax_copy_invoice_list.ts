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
  await page.getByRole('button', { name: '확인', exact: true }).click();
  console.log('Logged out successfully');
}

const login = async (page) => {
  await page.goto('https://hometax.go.kr');
  await page.waitForLoadState('networkidle');

  // if logined, skip login process
  if (await page.getByRole('link', { name: '로그아웃', exact: true }).isVisible()) {
    console.log('Already logged in, skipping login process');
    return;
    // logout(page);
    // console.log('Logged out successfully');
    // await page.goto('https://hometax.go.kr');
    // await page.waitForLoadState('networkidle');
  }

  await page.getByRole('link', { name: '로그인', exact: true }).click();
  await page.getByRole('button', { name: '공동·금융인증서' }).click();

  await page.locator('iframe[name="dscert"]').contentFrame().getByRole('link', { name: '브라우저' }).click();

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
  });
  await context.setDefaultTimeout(60000);
  const page = await context.newPage();
  console.log('Browser launched, trying to log in...');
  await login(page);

  // still iframe is popuped and not loggined, close and retry
  while (await page.locator('iframe[name="dscert"]').isVisible() && !await page.getByRole('link', { name: '로그아웃', exact: true }).isVisible()) {
    console.log('Login iframe still visible, closing and retrying login...');
    await page.locator('iframe[name="dscert"]').evaluate((frame) => {
      frame.remove();
    });
    await login(page);
  }

  console.log('Login successful, navigating to copy invoice page...');
  await page.waitForTimeout(1000);

  // 복사발급 페이지 이동
  await page.getByRole('link', { name: '계산서·영수증·카드' }).click();
  await page.getByRole('link', { name: '반복/복사 발급' }).click();
  await page.getByRole('link', { name: '전자(세금)계산서 복사발급' }).click();
  await page.getByRole('button', { name: '2개월' }).click();
  await page.getByRole('button', { name: '조회' }).click();

  // 결과 테이블 로딩 대기
  //await page.waitForLoadState('networkidle', { timeout: 5000 });
  await page.waitForTimeout(2000);

  // 목록 테이블에서 데이터 추출
  const rows = await page.evaluate(() => {
    const results: Record<string, string>[] = [];

    // 일반적인 홈택스 목록 테이블 탐색
    const tables = document.querySelectorAll('table');
    for (const table of tables) {
      const headers: string[] = [];
      const headerCells = table.querySelectorAll('thead th, thead td');
      headerCells.forEach(cell => headers.push(cell.textContent?.trim() ?? ''));

      if (headers.length === 0) continue;

      const bodyRows = table.querySelectorAll('tbody tr');
      bodyRows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length === 0) return;
        const rowData: Record<string, string> = {};
        cells.forEach((cell, i) => {
          const key = headers[i] ?? `col${i}`;
          rowData[key] = cell.textContent?.trim() ?? '';
        });
        results.push(rowData);
      });
    }

    return results;
  });

  if (rows.length === 0) {
    console.log('조회된 복사발급 세금계산서 목록이 없습니다.');
  } else {
    console.log(`\n## 복사발급 세금계산서 목록 (총 ${rows.length}건)\n`);
    rows.forEach((row, idx) => {
      console.log(`[${idx + 1}]`);
      Object.entries(row).forEach(([key, value]) => {
        if (key && value) console.log(`  ${key}: ${value}`);
      });
      console.log('');
    });
  }

  //wait for 5 seconds before closing browser
  await page.waitForTimeout(50000);

  await context.storageState({ path: authFile });
  await context.close();
})();
