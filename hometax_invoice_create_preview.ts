import { launchContext, loginWithRetry, assertBusiness, previewIssueButton, authFile } from './hometax_common.ts';
import { parseInvoiceCli, printInvoiceSummary, confirm, fillInvoiceForm, savePreviewScreenshot } from './hometax_invoice_form.ts';

const inv = parseInvoiceCli({
  name: 'hometax_invoice_create_preview',
  description: '홈택스 전자세금계산서 발급 미리보기 CLI (발급미리보기까지만 진행, 실제 발급/서명은 하지 않음)',
  yesDescription: '내용 확인 질문 없이 바로 미리보기 진행',
});

printInvoiceSummary(inv);
console.log('\n---\n');

if (!await confirm('위 내용으로 발급미리보기를 진행하시겠습니까?', inv.autoYes)) {
  console.log('취소되었습니다.');
  process.exit(0);
}

const context = await launchContext();
const page = await context.newPage();
console.log('Browser launched, trying to log in...');
await loginWithRetry(page);
await assertBusiness(page);

await fillInvoiceForm(page, inv);
await previewIssueButton(page).waitFor({ state: 'visible', timeout: 15000 });
const shot = await savePreviewScreenshot(page);
console.log(`발급미리보기까지 완료했습니다. 미리보기 화면: ${shot}`);
console.log('실제 발급은 hometax_invoice_create_submit.ts 로 진행하세요.');

await context.storageState({ path: authFile });
await context.close();
