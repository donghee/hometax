import { launchContext, loginWithRetry, printInvoices, getBusinessName, openInvoiceList, queryInvoices, authFile } from './hometax_common.ts';

(async () => {
  // CLI 인자 파싱: sales | purchase | both (기본값: both)
  const args = process.argv.slice(2);
  const typeArg = args[0]?.toLowerCase();
  // 선택 인자: 시작일 종료일 (YYYY-MM-DD). 없으면 최근 3개월.
  const range = args[1] && args[2] ? { from: args[1], to: args[2] } : undefined;
  const showSales = !typeArg || typeArg === '매출' || typeArg === 'sales' || typeArg === 'both';
  const showPurchase = !typeArg || typeArg === '매입' || typeArg === 'purchase' || typeArg === 'both';

  if (!showSales && !showPurchase) {
    console.error('사용법: npx tsx hometax_invoice_list.ts [sales|purchase|both] [시작일 종료일]');
    process.exit(1);
  }

  const context = await launchContext();
  const page = await context.newPage();
  console.log('Browser launched, trying to log in...');
  await loginWithRetry(page);
  await getBusinessName(page);

  console.log('Login successful, navigating to invoice page...');
  await openInvoiceList(page);

  const salesRows = showSales ? await queryInvoices(page, '매출', range) : [];
  const purchaseRows = showPurchase ? await queryInvoices(page, '매입', range) : [];

  if (showSales) printInvoices(salesRows, '매출');
  if (showPurchase) {
    if (showSales) console.log('----------------------------------------');
    printInvoices(purchaseRows, '매입');
  }

  await context.storageState({ path: authFile });
  await context.close();
})();
