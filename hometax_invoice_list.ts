import type { Page } from 'playwright';
import { launchContext, loginWithRetry, extractTableRows, printInvoices, getBusinessName, authFile } from './hometax_common.ts';

const navigateToInvoicePage = async (page: Page) => {
  console.log('Login successful, navigating to invoice page...');
  const invoiceLink = page.getByRole('link', { name: '계산서·영수증·카드' });
  await invoiceLink.waitFor({ state: 'visible' });
  await invoiceLink.click();
  await page.getByRole('link', { name: '전자(세금)계산서 조회' }).click();
  await page.getByRole('link', { name: '조회', exact: true }).click();
  await page.getByRole('link', { name: '발급 목록조회' }).click();
};

const getSalesInvoices = async (page: Page): Promise<Record<string, string>[]> => {
  await page.getByText('매출', { exact: true }).click();
  await page.getByRole('button', { name: '3개월' }).click();
  await page.getByRole('button', { name: '조회', exact: true }).click();
  await page.waitForTimeout(2000);
  return extractTableRows(page);
};

const getPurchaseInvoices = async (page: Page): Promise<Record<string, string>[]> => {
  await page.getByText('매입', { exact: true }).click();
  await page.getByRole('button', { name: '3개월' }).click();
  await page.getByRole('button', { name: '조회', exact: true }).click();
  await page.waitForTimeout(2000);
  return extractTableRows(page);
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

  const context = await launchContext({ headless: true, timeout: 60000 });
  const page = await context.newPage();
  console.log('Browser launched, trying to log in...');
  await loginWithRetry(page);
  await getBusinessName(page);

  await navigateToInvoicePage(page);

  let salesRows: Record<string, string>[] = [];
  let purchaseRows: Record<string, string>[] = [];

  if (showSales) salesRows = await getSalesInvoices(page);
  if (showPurchase) purchaseRows = await getPurchaseInvoices(page);

  if (showSales) printInvoices(salesRows, '매출');
  if (showPurchase) {
    if (showSales) console.log('----------------------------------------');
    printInvoices(purchaseRows, '매입');
  }

  await context.storageState({ path: authFile });
  await context.close();
})();
