import { program, Option } from 'commander';
import { launchContext, loginWithRetry, getBusinessName, openInvoiceList, queryInvoices, authFile } from './hometax_common.ts';

program
  .name('hometax_invoice_pdf')
  .description('발급 목록에서 세금계산서를 찾아 PDF로 저장한다.')
  .argument('<검색어>', '승인번호, 사업자등록번호, 상호명 중 목록에서 해당 행을 특정할 수 있는 문자열')
  .argument('[출력경로]', '저장할 PDF 파일 경로 (생략 시 ./<검색어>.pdf)')
  .addOption(new Option('--type <type>', '매출/매입 목록 중 어디서 찾을지').choices(['sales', 'purchase']).default('sales'))
  .addHelpText('after', `
예시:
  npx tsx hometax_invoice_pdf.ts 20260922-10260922-75984916 더피치_세금계산서.pdf
  npx tsx hometax_invoice_pdf.ts "주식회사 더피치" ./더피치_세금계산서.pdf
  npx tsx hometax_invoice_pdf.ts 20260922-10260922-75984916 --type purchase
`)
  .parse();

const [keyword, outArg] = program.args;
const outPath = outArg ?? `./${keyword}.pdf`;
const type: 'sales' | 'purchase' = program.opts().type;

(async () => {
  const context = await launchContext();
  const page = await context.newPage();
  console.log('Browser launched, trying to log in...');
  await loginWithRetry(page);
  await getBusinessName(page);

  console.log('Navigating to invoice list...');
  await openInvoiceList(page);
  await queryInvoices(page, type === 'purchase' ? '매입' : '매출');

  console.log(`"${keyword}"에 해당하는 세금계산서를 찾는 중...`);
  const row = page.locator('tr', { hasText: keyword }).first();
  if (!(await row.isVisible().catch(() => false))) {
    throw new Error(`목록에서 "${keyword}"에 해당하는 세금계산서를 찾을 수 없습니다. (조회 범위: 최근 3개월, ${type})`);
  }
  await row.getByText('상세보기').first().click({ timeout: 15000 });
  await page.waitForTimeout(2000);

  console.log('출력 화면을 열어 리포트 뷰어를 여는 중...');
  const printBtn = page.locator('input[value="출력"], button[value="출력"]').first();
  const [popup] = await Promise.all([
    context.waitForEvent('page', { timeout: 20000 }),
    printBtn.click(),
  ]);
  await popup.waitForLoadState('load', { timeout: 30000 }).catch(() => {});
  await popup.waitForTimeout(3000);

  console.log('저장(PDF) 메뉴로 다운로드하는 중...');
  await popup.locator('[title="저장"]').first().click();
  await popup.waitForTimeout(1000);
  await popup.locator('select[title="파일형식"]').selectOption('2'); // 2 = PDF 저장(*.pdf)
  await popup.waitForTimeout(500);

  const [download] = await Promise.all([
    popup.waitForEvent('download', { timeout: 20000 }),
    popup.getByText('저장', { exact: true }).last().click(),
  ]);
  await download.saveAs(outPath);
  console.log(`PDF 저장 완료: ${outPath}`);

  await popup.close();
  await context.storageState({ path: authFile });
  await context.close();
})();
