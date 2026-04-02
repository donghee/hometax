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
  }

  await page.getByRole('link', { name: '로그인', exact: true }).click();
  await page.getByRole('button', { name: '공동·금융인증서' }).click();

  await page.locator('iframe[name="dscert"]').contentFrame().getByRole('link', { name: '브라우저' }).click();

  await page.locator('iframe[name="dscert"]').contentFrame().locator('a').filter({ hasText: certName }).click();
  await page.locator('iframe[name="dscert"]').contentFrame().getByRole('textbox', { name: '비밀번호 입력' }).fill(certPassword);
  await page.locator('iframe[name="dscert"]').contentFrame().getByRole('textbox', { name: '비밀번호 입력' }).press('Enter');

  const logoutLink = await page.getByRole('link', { name: '로그아웃', exact: true })
  await logoutLink.waitFor({ state: 'visible' });
}

const extractTableRows = async (page): Promise<Record<string, string>[]> => {
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

const navigateToInvoicePage = async (page) => {
  console.log('Login successful, navigating to invoice page...');
  const invoiceLink = await page.getByRole('link', { name: '계산서·영수증·카드' });
  await invoiceLink.waitFor({ state: 'visible' });
  await invoiceLink.click();
  await page.getByRole('link', { name: '전자(세금)계산서 조회' }).click();
  await page.getByRole('link', { name: '조회', exact: true }).click();
  await page.getByRole('link', { name: '발급 목록조회' }).click();
};

const getSalesInvoices = async (page): Promise<Record<string, string>[]> => {
  await page.getByText('매출', { exact: true }).click();
  await page.getByRole('button', { name: '3개월' }).click();
  await page.getByRole('button', { name: '조회', exact: true }).click();
  await page.waitForTimeout(2000);
  return extractTableRows(page);
};

const getPurchaseInvoices = async (page): Promise<Record<string, string>[]> => {
  await page.getByText('매입', { exact: true }).click();
  await page.getByRole('button', { name: '3개월' }).click();
  await page.getByRole('button', { name: '조회', exact: true }).click();
  await page.waitForTimeout(2000); 
  return extractTableRows(page);
};

const printInvoices = (rows: Record<string, string>[], label: string) => {
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

(async () => {
  // CLI 인자 파싱: sales | purchase | both (기본값: both)
  const args = process.argv.slice(2);
  const typeArg = args[0]?.toLowerCase();
  const showSales = !typeArg || typeArg === '매출' || typeArg === 'sales' || typeArg === 'both';
  const showPurchase = !typeArg || typeArg === '매입' || typeArg === 'purchase' || typeArg === 'both';

  if (!showSales && !showPurchase) {
    console.error('사용법: npx ts-node hometax_invoice_list.ts [매출|매입|both]');
    process.exit(1);
  }

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chrome",
    headless: true,
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

  await navigateToInvoicePage(page);

  let salesRows: Record<string, string>[] = [];
  let purchaseRows: Record<string, string>[] = [];

  if (showSales) {
    salesRows = await getSalesInvoices(page);
  }

  if (showPurchase) {
    purchaseRows = await getPurchaseInvoices(page);
  }

  if (showSales) {
    printInvoices(salesRows, '매출');
  }

  if (showPurchase) {
    if (showSales) console.log('----------------------------------------');
    printInvoices(purchaseRows, '매입');
  }

  await context.storageState({ path: authFile });
  await context.close();
})();
