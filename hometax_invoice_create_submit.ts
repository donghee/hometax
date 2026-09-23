import { launchContext, loginWithRetry, assertBusiness, previewIssueButton, issueWithCertificate, findIssuedInvoices, authFile } from './hometax_common.ts';
import { parseInvoiceCli, printInvoiceSummary, confirm, fillInvoiceForm, savePreviewScreenshot, matchesInvoice } from './hometax_invoice_form.ts';

const inv = parseInvoiceCli({
  name: 'hometax_invoice_create_submit',
  description: '홈택스 전자세금계산서 발급 + 최종 제출(인증서 전자서명) CLI. 실제로 세금계산서가 발급되어 상대방에게 전송되니 주의할 것.',
  yesDescription: '모든 확인(내용 확인 + 최종 서명 발급) 없이 바로 발급',
  notice: "주의: 이 스크립트는 '발급미리보기' 이후 실제 '발급하기' 버튼과 공동·금융인증서 전자서명까지\n자동으로 진행하여 세금계산서를 최종 발급(전송)한다. 되돌릴 수 없으니 발급 전 내용을 반드시 확인할 것.",
});

printInvoiceSummary(inv);
console.log('\n주의: 이 내용으로 실제 발급(전송)까지 자동 진행됩니다. 되돌릴 수 없습니다.');
console.log('\n---\n');

if (!await confirm('위 내용으로 발급하시겠습니까?', inv.autoYes)) {
  console.log('취소되었습니다.');
  process.exit(0);
}

const context = await launchContext();
const page = await context.newPage();
try {
  console.log('Browser launched, trying to log in...');
  await loginWithRetry(page);
  await assertBusiness(page);

  await fillInvoiceForm(page, inv);
  await previewIssueButton(page).waitFor({ state: 'visible', timeout: 15000 });
  const shot = await savePreviewScreenshot(page);
  console.log(`발급미리보기 화면: ${shot}`);

  if (!await confirm('인증서로 서명하여 최종 발급하시겠습니까? 되돌릴 수 없습니다.', inv.autoYes)) {
    console.log('취소되었습니다.');
  } else {
    await issueWithCertificate(page);

    console.log('발급 내역 확인 중...');
    const issued = await findIssuedInvoices(page, (row) => matchesInvoice(row, inv));
    if (issued.length === 0) {
      console.error('경고: 발급 목록에서 방금 발급한 세금계산서를 찾지 못했습니다. hometax_invoice_list.ts sales 로 직접 확인하세요.');
      process.exitCode = 1;
    } else {
      issued.forEach((row) => console.log(`발급 완료: 승인번호 ${row['승인번호']} (작성일자 ${row['작성일자']}, 합계 ${row['합계금액']})`));
    }
  }

  await context.storageState({ path: authFile });
} finally {
  await context.close();
}
