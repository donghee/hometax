import { chromium, type Page, type BrowserContext, type Locator } from 'playwright';
import path from 'path';
import os from 'os';
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

// dscert 인증서 팝업(iframe)에서 인증서를 선택하고 비밀번호를 입력해 서명한다.
// 로그인 시의 "공동·금융인증서" 팝업과 세금계산서 발급 시의 전자서명 팝업이 동일한 컴포넌트를 사용한다.
export const signWithCertificate = async (page: Page) => {
  if (!certName || (!certPassword_ && !certPassEntry)) {
    throw new Error('환경변수 CERT_NAME과, CERT_PASSWORD 또는 CERT_PASS_ENTRY 중 하나가 설정되어야 합니다.');
  }
  const certPassword = await getCertPassword();

  const certFrame = page.locator('iframe[name="dscert"]').contentFrame();

  const browserTab = certFrame.getByRole('link', { name: '브라우저' });
  if (await browserTab.isVisible().catch(() => false)) {
    await browserTab.click();
    await page.waitForTimeout(1500);
  }

  // 인증서 목록이 <a> 링크 형태(로그인 팝업)인 경우와, 그리드/테이블(<tr>) 형태
  // (예: 전자세금계산서 수정발급 화면의 인증유형 선택 팝업)인 경우가 모두 존재한다.
  // 그리드는 비동기로 렌더링되어 뜸을 들이며 나타날 수 있어 잠깐 재시도한다.
  const certLink = certFrame.locator('a').filter({ hasText: certName });
  const certRow = certFrame.locator('tr').filter({ hasText: certName }).first();
  let matched: 'link' | 'row' | null = null;
  for (let attempt = 0; attempt < 5 && !matched; attempt++) {
    if (await certLink.isVisible().catch(() => false)) {
      matched = 'link';
      break;
    }
    if (await certRow.isVisible().catch(() => false)) {
      matched = 'row';
      break;
    }
    await page.waitForTimeout(1000);
  }
  if (matched === 'link') {
    await certLink.click();
  } else if (matched === 'row') {
    await certRow.click();
  } else {
    throw new Error(`인증서를 찾을 수 없습니다: "${certName}"`);
  }
  await certFrame.getByRole('textbox', { name: '비밀번호 입력' }).fill(certPassword);
  await certFrame.getByRole('textbox', { name: '비밀번호 입력' }).press('Enter');
};

export const login = async (page: Page) => {
  await page.goto('https://hometax.go.kr');
  await page.waitForLoadState('networkidle');

  if (await page.getByRole('link', { name: '로그아웃', exact: true }).isVisible()) {
    console.log('Already logged in, skipping login process');
    return;
  }

  await page.getByRole('link', { name: '로그인', exact: true }).click();
  await page.getByRole('button', { name: '공동·금융인증서' }).click();
  await signWithCertificate(page);

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

// 발급·취소처럼 되돌릴 수 없는 작업 전에, 로그인된 사업자가 .env의 BUSINESS_NAME과 같은지 확인한다.
// .env에서 사업자 블록 전환을 잊은 채 다른 사업자 명의로 발급하는 사고를 막기 위함.
export const assertBusiness = async (page: Page) => {
  const expected = process.env.BUSINESS_NAME;
  const name = await getBusinessName(page);
  if (!expected) {
    throw new Error('.env에 BUSINESS_NAME(로그인 후 표시되는 사업자명)을 설정해야 발급/취소할 수 있습니다.');
  }
  if (name !== expected) {
    throw new Error(`로그인된 사업자 "${name}"가 .env의 BUSINESS_NAME "${expected}"와 다릅니다. 중단합니다.`);
  }
};

export const openInvoiceList = async (page: Page) => {
  const invoiceLink = page.getByRole('link', { name: '계산서·영수증·카드' });
  await invoiceLink.waitFor({ state: 'visible' });
  await invoiceLink.click();
  await page.getByRole('link', { name: '전자(세금)계산서 조회' }).click();
  await page.getByRole('link', { name: '조회', exact: true }).click();
  await page.getByRole('link', { name: '발급 목록조회' }).click();
};

// '발급 목록조회' 화면에서 매출/매입 목록(최근 3개월)을 조회한다. openInvoiceList 이후 호출.
export const queryInvoices = async (page: Page, type: '매출' | '매입'): Promise<Record<string, string>[]> => {
  await page.getByText(type, { exact: true }).click();
  await page.getByRole('button', { name: '3개월' }).click();
  await page.getByRole('button', { name: '조회', exact: true }).click();
  await page.waitForTimeout(2000);
  return extractTableRows(page);
};

// 발급/취소 직후 목록을 다시 조회해 실제로 등록되었는지 확인한다. 팝업이 닫힌 것만으로는 성공을 보장할 수 없다.
export const findIssuedInvoices = async (
  page: Page,
  match: (row: Record<string, string>) => boolean,
): Promise<Record<string, string>[]> => {
  await page.goto('https://hometax.go.kr');
  await page.waitForLoadState('networkidle');
  await openInvoiceList(page);
  const rows = await queryInvoices(page, '매출');
  return rows.filter(match);
};

export const launchContext = async (options: { headless?: boolean; timeout?: number } = {}): Promise<BrowserContext> => {
  const { headless = true, timeout = 60000 } = options;
  // storageState는 launchPersistentContext 타입 정의에는 없지만 런타임에서는 적용된다.
  // 홈택스 세션 쿠키는 브라우저 프로필에 남지 않으므로, user.json으로 재시작 후에도 로그인을 유지한다.
  const launchOptions = {
    channel: 'chrome',
    headless,
    permissions: ['local-network-access'],
    storageState: authFile,
    viewport: { width: 1600, height: 1200 },
  };
  const context = await chromium.launchPersistentContext(userDataDir, launchOptions);
  await context.setDefaultTimeout(timeout);
  return context;
};

// WebSquare id는 "mf_txppWframe_" 같은 프레임 경로 접두사 + 개발자가 붙인 이름으로 구성된다.
// 접두사는 화면을 감싸는 프레임 구조에 따라 바뀌므로 이름(접미사)만으로 찾는다.
export const byIdSuffix = (page: Page, suffix: string): Locator => page.locator(`[id$="${suffix}"]`);

// 발급미리보기 팝업의 '발급하기' 버튼. 기본 폼에도 같은 이름의 버튼이 있어 떠 있는 팝업 안으로 한정한다.
export const previewIssueButton = (page: Page): Locator =>
  page.locator('.w2popup_window:visible').getByRole('button', { name: '발급하기', exact: true });

const appears = (loc: Locator, timeout: number) =>
  loc.waitFor({ state: 'visible', timeout }).then(() => true, () => false);

// 발급미리보기 팝업의 '발급하기'를 눌러 인증서 서명까지 마친다.
// 발급하기 이후 2차 확인 팝업("확인(인증 화면 이동)")과 인증유형 선택 팝업("공동∙금융 인증")이
// 뜨는 경우가 있어 순서대로 처리한다. 다단계 팝업 전환 타이밍이 불안정해 인증서 팝업은 폴링으로 기다린다.
export const issueWithCertificate = async (page: Page) => {
  const issueBtn = previewIssueButton(page);
  page.on('dialog', async (dialog) => {
    console.log(`다이얼로그 감지: [${dialog.type()}] ${dialog.message()} -> 확인 처리`);
    await dialog.accept().catch(() => {});
  });

  console.log('발급하기 클릭...');
  await issueBtn.click();

  const confirmMoveBtn = page.getByRole('button', { name: '확인(인증 화면 이동)' });
  if (await appears(confirmMoveBtn, 10000)) {
    console.log('2차 확인 팝업: "확인(인증 화면 이동)" 클릭...');
    await confirmMoveBtn.click();
  }

  // 인증유형 구분자는 가운뎃점(·)이 아닌 U+2219(∙)다.
  const certAuthOption = page.getByText('공동∙금융 인증', { exact: true }).first();
  if (await appears(certAuthOption, 10000)) {
    console.log('인증유형 선택: "공동∙금융 인증"...');
    await certAuthOption.click();
  }

  console.log('인증서 팝업 대기 중...');
  let dscertReady = false;
  for (let attempt = 0; attempt < 20 && !dscertReady; attempt++) {
    await page.waitForTimeout(3000);
    dscertReady = await page.locator('iframe[name="dscert"]').isVisible().catch(() => false);
    if (!dscertReady && await certAuthOption.isVisible().catch(() => false)) {
      await certAuthOption.click().catch(() => {});
    }
  }
  if (!dscertReady) {
    const shot = path.join(os.tmpdir(), 'hometax_issue_debug.png');
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
    throw new Error(`인증서 팝업이 나타나지 않았습니다. 디버그 스크린샷: ${shot}`);
  }

  console.log('인증서 전자서명 진행...');
  await signWithCertificate(page);
  await issueBtn.waitFor({ state: 'hidden', timeout: 60000 });
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
