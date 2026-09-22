import { chromium, type Page, type BrowserContext } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '.env') });

export const authFile = path.join(__dirname, 'user.json');
export const userDataDir = path.join(__dirname, 'google-chrome');

export const certName = process.env.CERT_NAME!;
const certPassword_ = process.env.CERT_PASSWORD!;
const certPassEntry = process.env.CERT_PASS_ENTRY!;

// CERT_PASSWORD가 .env에 직접 있으면 그것을 쓰고, 없으면 `pass`(GPG 기반 패스워드
// 스토어)의 CERT_PASS_ENTRY 항목에서 실행 시점에 조회한다.
const getCertPassword = async (): Promise<string> => {
  if (certPassword_) return certPassword_;
  const { stdout } = await execFileAsync('pass', ['show', certPassEntry]);
  return stdout.split('\n')[0].trim();
};

export const logout = async (page: Page) => {
  await page.getByRole('link', { name: '로그아웃', exact: true }).click();
  await page.getByRole('button', { name: '확인', exact: true }).click();
  console.log('Logged out successfully');
};

export const login = async (page: Page) => {
  await page.goto('https://hometax.go.kr');
  await page.waitForLoadState('networkidle');

  if (await page.getByRole('link', { name: '로그아웃', exact: true }).isVisible()) {
    console.log('Already logged in, skipping login process');
    return;
  }

  if (!certName || (!certPassword_ && !certPassEntry)) {
    throw new Error('환경변수 CERT_NAME과, CERT_PASSWORD 또는 CERT_PASS_ENTRY 중 하나가 설정되어야 합니다.');
  }
  const certPassword = await getCertPassword();

  await page.getByRole('link', { name: '로그인', exact: true }).click();
  await page.getByRole('button', { name: '공동·금융인증서' }).click();

  const certFrame = page.locator('iframe[name="dscert"]').contentFrame();

  await certFrame.getByRole('link', { name: '브라우저' }).click();

  const certLink = certFrame.locator('a').filter({ hasText: certName });
  if (!await certLink.isVisible()) {
    throw new Error(`인증서를 찾을 수 없습니다: "${certName}"`);
  }
  await certLink.click();
  await certFrame.getByRole('textbox', { name: '비밀번호 입력' }).fill(certPassword);
  await certFrame.getByRole('textbox', { name: '비밀번호 입력' }).press('Enter');

  try {
    const logoutLink = page.getByRole('link', { name: '로그아웃', exact: true });
    await logoutLink.waitFor({ state: 'visible', timeout: 15000 });
  } catch {
    throw new Error('로그인 실패: 비밀번호가 틀렸거나 인증서 오류가 발생했습니다.');
  }
};

export const loginWithRetry = async (page: Page, maxRetries = 3) => {
  await login(page);
  let attempts = 0;
  while (
    await page.locator('iframe[name="dscert"]').isVisible() &&
    !await page.getByRole('link', { name: '로그아웃', exact: true }).isVisible()
  ) {
    if (attempts >= maxRetries) {
      throw new Error(`로그인 실패: ${maxRetries}회 재시도 후에도 로그인되지 않았습니다.`);
    }
    attempts++;
    console.log(`Login iframe still visible, closing and retrying login... (${attempts}/${maxRetries})`);
    await page.locator('iframe[name="dscert"]').evaluate((frame) => {
      frame.remove();
    });
    await login(page);
  }
};

export const getBusinessName = async (page: Page): Promise<string> => {
  const userName = page.locator('.user_name').first();
  await userName.waitFor({ state: 'attached' });
  await page.waitForFunction(
    (el) => (el as HTMLElement).innerText.trim().length > 0,
    await userName.elementHandle(),
    { timeout: 15000 }
  );
  const name = (await userName.innerText()).trim();
  console.log(`로그인된 사업자: ${name}`);
  return name;
};

export const launchContext = async (options: { headless?: boolean; timeout?: number } = {}): Promise<BrowserContext> => {
  const { headless = false, timeout = 60000 } = options;
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chrome',
    headless,
    permissions: ['local-network-access'],
    storageState: authFile,
    viewport: { width: 1600, height: 1200 },
  });
  await context.setDefaultTimeout(timeout);
  return context;
};

export const extractTableRows = async (page: Page): Promise<Record<string, string>[]> => {
  return page.evaluate(() => {
    const results: Record<string, string>[] = [];
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
};

export const printInvoices = (rows: Record<string, string>[], label: string) => {
  if (rows.length === 0) {
    console.log(`조회된 ${label} 세금계산서 목록이 없습니다.`);
    return;
  }
  console.log(`\n## ${label} 세금계산서 목록 (총 ${rows.length}건)\n`);
  rows.forEach((row, idx) => {
    console.log(`[${idx + 1}]`);
    Object.entries(row).forEach(([key, value]) => {
      if (key && value) console.log(`  ${key}: ${value}`);
    });
    console.log('');
  });
};
