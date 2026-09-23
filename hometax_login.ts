import { launchContext, loginWithRetry, getBusinessName, logout, authFile } from './hometax_common.ts';

// 브라우저 프로필에 남은 세션이 있으면 로그아웃 후 .env의 인증서로 다시 로그인한다.
// (.env에서 사업자를 전환한 뒤 이전 사업자 세션이 그대로 쓰이는 것을 막는다.)
(async () => {
  const context = await launchContext();
  const page = await context.newPage();
  await page.goto('https://hometax.go.kr');
  await page.waitForLoadState('networkidle');
  if (await page.getByRole('link', { name: '로그아웃', exact: true }).isVisible()) {
    console.log('Logging out of current session...');
    await logout(page);
  }
  console.log('Browser launched, trying to log in...');
  await loginWithRetry(page);
  await getBusinessName(page);

  await context.storageState({ path: authFile });
  await context.close();
})();
