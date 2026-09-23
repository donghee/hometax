import { launchContext, loginWithRetry, getBusinessName, logout, authFile } from './hometax_common.ts';

(async () => {
  const context = await launchContext({ headless: true, timeout: 60000 * 60 });
  const page = await context.newPage();
  if (await page.getByRole('link', { name: '로그아웃', exact: true }).isVisible()) {
    console.log('Logging out of current session...');
    await logout(page);
  }
  console.log('Browser launched, trying to log in...');
  await loginWithRetry(page);
  await getBusinessName(page);

  // console.log('Login successful, navigating to copy invoice page...');
  // await page.getByRole('link', { name: '계산서·영수증·카드' }).click();
  // await page.getByRole('link', { name: '반복/복사 발급' }).click();
  // await page.getByRole('link', { name: '전자(세금)계산서 복사발급' }).click();
  // await page.getByRole('button', { name: '2개월' }).click();
  // await page.getByRole('button', { name: '조회' }).click();

  await context.storageState({ path: authFile });
  await context.close();
})();
