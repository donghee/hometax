import { launchContext, loginWithRetry, getBusinessName, openCardPurchaseList, queryCardPurchases, printCardPurchases, authFile } from './hometax_common.ts';

(async () => {
  // 사용법: npx tsx hometax_card_purchase_list.ts [YYYY-MM [YYYY-MM]]  (없으면 이번 달, 하나면 그 달, 둘이면 해당 기간)
  const args = process.argv.slice(2);
  const ym = /^\d{4}-(0[1-9]|1[0-2])$/;
  if (args.length > 2 || args.some(a => !ym.test(a))) {
    console.error('사용법: npx tsx hometax_card_purchase_list.ts [YYYY-MM [YYYY-MM]]');
    process.exit(1);
  }
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const from = args[0] ?? thisMonth;
  const to = args[1] ?? from;
  if (from > to) {
    console.error('시작월이 종료월보다 늦습니다.');
    process.exit(1);
  }

  // 기본은 headless. 화면을 보며 디버깅하려면 CARD_HEADED=1.
  const context = await launchContext({ headless: process.env.CARD_HEADED !== '1' });
  try {
    const page = await context.newPage();
    console.log('Browser launched, trying to log in...');
    await loginWithRetry(page);
    await getBusinessName(page);

    await openCardPurchaseList(page);
    const rows = await queryCardPurchases(page, from, to);
    printCardPurchases(rows);

    await context.storageState({ path: authFile });
  } finally {
    await context.close();
  }
})();
