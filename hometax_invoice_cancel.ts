import { program } from 'commander';
import type { Page } from 'playwright';
import { launchContext, loginWithRetry, assertBusiness, byIdSuffix, previewIssueButton, issueWithCertificate, findIssuedInvoices, authFile } from './hometax_common.ts';

program
  .name('hometax_invoice_cancel')
  .description(
    '홈택스 전자(세금)계산서 취소 CLI. "착오에 의한 이중발급 등" 사유로 수정발급하여, ' +
    '당초 세금계산서와 동일 금액의 음수(-) 세금계산서를 발급함으로써 전체 취소 처리한다.'
  )
  .argument('<승인번호>', '취소할 세금계산서의 당초 승인번호 (예: 20260922-10260922-75984916)')
  .option('-y, --yes', '미리보기 확인 없이 바로 서명하여 최종 취소 처리')
  .addHelpText('after', `
예시:
  $ npx tsx hometax_invoice_cancel.ts 20260922-10260922-75984916
      -> 취소 내용(미리보기)까지만 진행하고 멈춘다. 내용을 확인한 뒤,
  $ npx tsx hometax_invoice_cancel.ts 20260922-10260922-75984916 --yes
      -> 를 실행하면 인증서 전자서명까지 자동으로 진행하여 실제로 취소(수정발급)한다.

주의: --yes 옵션은 실제로 국세청에 음수 세금계산서를 전송하여 되돌릴 수 없다.
`)
  .parse();

const [aprvNo] = program.args;
const autoYes = program.opts().yes === true;

const inputValue = (page: Page, name: string) =>
  page.getByRole('textbox', { name, exact: true }).first().inputValue({ timeout: 2000 }).catch(() => '');

const printCancelSummary = async (page: Page) => {
  const amounts = await page.evaluate((labels: string[]) => {
    const cells = Array.from(document.querySelectorAll('th, td, span, div'));
    const result: Record<string, string> = {};
    for (const label of labels) {
      const labelEl = cells.find((el) => (el as HTMLElement).innerText?.trim() === label);
      result[label] = (labelEl?.nextElementSibling as HTMLElement | null)?.innerText?.trim() ?? '';
    }
    return result;
  }, ['합계금액', '공급가액', '세액']);
  const writeDate = await byIdSuffix(page, 'calWrtDtTop_input').inputValue({ timeout: 2000 }).catch(() => '');

  console.log('\n# 취소(수정) 세금계산서 내용\n');
  console.log(`당초승인번호: ${aprvNo}`);
  console.log(`작성일자: ${writeDate}`);
  console.log(`공급가액: ${amounts.공급가액}`);
  console.log(`세액: ${amounts.세액}`);
  console.log(`합계금액: ${amounts.합계금액}`);
  console.log('\n품목:');
  for (let row = 1; row <= 4; row++) {
    const name = await inputValue(page, `${row}행 품목`);
    if (!name) break;
    console.log(`  ${name}  수량: ${await inputValue(page, `${row}행 수량`)}  단가: ${await inputValue(page, `${row}행 단가`)}`);
  }
};

const context = await launchContext();
const page = await context.newPage();
try {
  console.log('Browser launched, trying to log in...');
  await loginWithRetry(page);
  await assertBusiness(page);

  console.log('Navigating to 전자(세금)계산서 수정발급...');
  await page.getByRole('link', { name: '계산서·영수증·카드' }).click();
  await page.getByRole('link', { name: '전자(세금)계산서 수정발급', exact: true }).click();
  await page.waitForLoadState('load');
  await page.waitForTimeout(2000);

  console.log(`당초 승인번호 입력: ${aprvNo}`);
  // 세금계산서 탭과 (숨겨진) 계산서(면세) 탭에 같은 입력창이 있어 보이는 것만 고른다.
  const aprvInput = page.getByPlaceholder('승인번호를 아는 경우 입력하세요').filter({ visible: true });
  await aprvInput.fill(aprvNo);
  await aprvInput.locator('xpath=following-sibling::a[1]').click();
  await page.waitForTimeout(2000);

  console.log('수정발급 사유 "착오에 의한 이중발급 등" 선택...');
  const reasonCard = page.locator('div.w2group.tit', { hasText: '착오에 의한 이중발급 등' });
  if (!await reasonCard.waitFor({ state: 'visible', timeout: 15000 }).then(() => true, () => false)) {
    throw new Error(`승인번호 "${aprvNo}"에 해당하는 전자(세금)계산서를 찾을 수 없거나 수정발급할 수 없습니다.`);
  }
  await reasonCard.getByText('발급하기').click();
  await page.waitForLoadState('load');
  await page.waitForTimeout(2000);

  await printCancelSummary(page);

  console.log('\n발급미리보기 여는 중...');
  await page.getByRole('button', { name: '발급미리보기' }).click();
  await previewIssueButton(page).waitFor({ state: 'visible', timeout: 15000 });

  if (!autoYes) {
    console.log('\n위 내용으로 취소(수정발급)가 준비되었습니다.');
    console.log('실제로 취소를 진행하려면 --yes 옵션을 붙여 다시 실행하세요:');
    console.log(`  npx tsx hometax_invoice_cancel.ts ${aprvNo} --yes`);
    console.log('\n주의: --yes 실행 시 인증서 전자서명까지 자동으로 진행되어 실제로 취소 처리되며, 되돌릴 수 없습니다.');
  } else {
    await issueWithCertificate(page);

    console.log('취소 내역 확인 중...');
    const issued = await findIssuedInvoices(page, (row) => (row['비고'] ?? '').includes(aprvNo));
    if (issued.length === 0) {
      console.error('경고: 발급 목록에서 취소(수정) 세금계산서를 찾지 못했습니다. hometax_invoice_list.ts sales 로 직접 확인하세요.');
      process.exitCode = 1;
    } else {
      issued.forEach((row) => console.log(`취소 완료: 수정 승인번호 ${row['승인번호']} (합계 ${row['합계금액']})`));
    }
  }

  await context.storageState({ path: authFile });
} finally {
  await context.close();
}
