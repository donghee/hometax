import { launchContext, loginWithRetry, extractTableRows, printInvoices, authFile } from './hometax_common.ts';

(async () => {
  const context = await launchContext({ headless: true, timeout: 60000 });
  const page = await context.newPage();
  console.log('Browser launched, trying to log in...');
  await loginWithRetry(page);

  // 복사발급 페이지 이동
  console.log('Login successful, navigating to copy invoice page...');
  const invoiceLink = page.getByRole('link', { name: '계산서·영수증·카드' });
  await invoiceLink.waitFor({ state: 'visible' });
  await invoiceLink.click();
  await page.getByRole('link', { name: '반복/복사 발급' }).click();
  await page.getByRole('link', { name: '전자(세금)계산서 복사발급' }).click();
  await page.getByRole('button', { name: '2개월' }).click();
  await page.getByRole('button', { name: '조회' }).click();

  // 결과 테이블 로딩 대기
  await page.waitForTimeout(1000);
  await page.waitForLoadState('load', { timeout: 2000 });

  const rows = await extractTableRows(page);
  printInvoices(rows, '복사발급');

  await context.storageState({ path: authFile });
  await context.close();
})();
