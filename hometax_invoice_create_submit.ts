import path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs';
import * as readline from 'readline';
import { program } from 'commander';
import type { Page } from 'playwright';
import { launchContext, loginWithRetry, getBusinessName, signWithCertificate, authFile } from './hometax_common.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const recipients: Record<string, Recipient> = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'recipients.json'), 'utf-8')
);

interface Recipient {
  name: string;
  ceo: string;
  address: string;
  businessType: string;
  businessItem: string;
  email1: string;
  email2?: string;
}

interface Item {
  name: string;
  qty: number;
  price: number;
}

const todayDay = new Date().getDate().toString();
const lastMonth = (new Date().getMonth()).toString();

const ask = (rl: readline.Interface, question: string): Promise<string> =>
  new Promise((resolve) => rl.question(question, resolve));

program
  .name('hometax_invoice_create_submit')
  .description('홈택스 전자세금계산서 발급 + 최종 제출(인증서 전자서명) CLI. 실제로 세금계산서가 발급되어 상대방에게 전송되니 주의할 것.')
  .argument('[bizNo]', '수신자 사업자번호', '1498100925')
  .argument('[items...]', '품목 목록 (형식: 품목명:수량:단가)')
  .option('-f, --file <path>', '품목 JSON 파일 경로 ([{"name":"...", "qty":1, "price":5000}])')
  .option('-d, --date <day>', '작성일 (일, 1~31)', todayDay)
  .option('-y, --yes', '모든 확인(내용 확인 + 최종 서명 발급) 없이 바로 발급')
  .addHelpText('after', `
예시:
  $ npx tsx hometax_invoice_create_submit.ts 1498100925 "F450 드론:1:5000" "배터리:2:2000"
  $ npx tsx hometax_invoice_create_submit.ts 1078641704 "${lastMonth}월 유지보수지급액:1:250000"
  $ npx tsx hometax_invoice_create_submit.ts 1498100925 --file items.json

등록된 수신자:
${Object.entries(recipients).map(([k, v]) => `  ${k}  ${v.name} (${v.ceo})`).join('\n')}

주의: 이 스크립트는 '발급미리보기' 이후 실제 '발급하기' 버튼과 공동·금융인증서 전자서명까지
자동으로 진행하여 세금계산서를 최종 발급(전송)한다. 되돌릴 수 없으니 발급 전 내용을 반드시 확인할 것.
`)
  .parse();

const [bizNo = '1498100925', ...itemArgs] = program.args;
const opts = program.opts();

const recipient = recipients[bizNo];
if (!recipient) {
  console.error(`오류: 등록되지 않은 사업자번호 "${bizNo}"`);
  console.error('등록된 번호:', Object.keys(recipients).join(', '));
  process.exit(1);
}

let items: Item[];
if (opts.file) {
  items = JSON.parse(fs.readFileSync(opts.file, 'utf-8'));
} else if (itemArgs.length > 0) {
  items = itemArgs.map((a: string) => {
    const parts = a.split(':');
    if (parts.length !== 3) {
      console.error(`오류: 품목 형식이 잘못되었습니다 "${a}"`);
      console.error('올바른 형식: 품목명:수량:단가  (예: "F450 드론:1:5000")');
      process.exit(1);
    }
    const [name, qty, price] = parts;
    return { name, qty: Number(qty), price: Number(price) };
  });
} else {
  console.error('오류: 품목을 입력하세요. (인자 또는 --file 옵션)');
  program.help();
  process.exit(1);
}

const issueDay = opts.date;

console.log('\n# 세금계산서 발급 내용 확인\n');
console.log(`수신자: ${recipient.name} (${bizNo})`);
console.log(`대  표: ${recipient.ceo}`);
console.log(`주  소: ${recipient.address}`);
console.log(`이메일: ${recipient.email1}${recipient.email2 ? ', ' + recipient.email2 : ''}`);
console.log(`\n작성일: ${issueDay}일`);
console.log('\n품  목:');
let supplyTotal = 0;
for (const item of items) {
  const subtotal = item.qty * item.price;
  supplyTotal += subtotal;
  console.log(`  ${item.name}  수량: ${item.qty}  단가: ${item.price.toLocaleString()}원  금액: ${subtotal.toLocaleString()}원`);
}
const taxTotal = Math.floor(supplyTotal * 0.1);
console.log(`\n  공급가액: ${supplyTotal.toLocaleString()}원  세액: ${taxTotal.toLocaleString()}원  합계: ${(supplyTotal + taxTotal).toLocaleString()}원`);
console.log('\n주의: 이 내용으로 실제 발급(전송)까지 자동 진행됩니다. 되돌릴 수 없습니다.');
console.log('\n---\n');

const autoYes = opts.yes === true;

(async () => {
  if (!autoYes) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await ask(rl, '위 내용으로 발급하시겠습니까? (y/N) ');
    if (answer.trim().toLowerCase() !== 'y') {
      console.log('취소되었습니다.');
      rl.close();
      process.exit(0);
    }
    rl.close();
  } else {
    console.log('위 내용으로 발급하시겠습니까? (y/N) y');
  }

  await main();
})();

async function main() {
  const context = await launchContext({ headless: false, timeout: 60000 * 60 });
  const page = await context.newPage();
  console.log('Browser launched, trying to log in...');
  await loginWithRetry(page);
  await getBusinessName(page);

  console.log('Login successful, navigating to invoice page...');
  await page.getByRole('link', { name: '계산서·영수증·카드' }).click();
  await page.getByRole('link', { name: '전자(세금)계산서 건별발급' }).click();

  await page.waitForLoadState('load');
  await page.waitForTimeout(2000);

  console.log(`Filling out recipient form for ${recipient.name} (${bizNo})...`);
  await page.getByRole('textbox', { name: '등록번호' }).fill(bizNo);
  await page.getByRole('button', { name: '확인' }).click();
  await page.waitForTimeout(500);

  await page.locator('#mf_txppWframe_edtDmnrTnmNmTop').fill(recipient.name);
  await page.locator('#mf_txppWframe_edtDmnrRprsFnmTop').fill(recipient.ceo);
  await page.getByTitle('사업장주소입력').fill(recipient.address);
  await page.getByTitle('업태입력', { exact: true }).fill(recipient.businessType);
  await page.locator('#mf_txppWframe_edtDmnrItmNmTop').fill(recipient.businessItem);

  const [email1Id, email1Domain] = recipient.email1.split('@');
  await page.locator('#mf_txppWframe_edtDmnrMchrgEmlIdTop').fill(email1Id);
  await page.locator('#mf_txppWframe_edtDmnrMchrgEmlDmanTop').fill(email1Domain);

  if (recipient.email2) {
    const [email2Id, email2Domain] = recipient.email2.split('@');
    await page.locator('#mf_txppWframe_edtDmnrSchrgEmlIdTop').fill(email2Id);
    await page.locator('#mf_txppWframe_edtDmnrSchrgEmlDmanTop').fill(email2Domain);
  }

  // 작성일자
  await page.getByRole('button', { name: 'Calendar' }).click();
  await page.getByRole('button', { name: 'TodayToday' }).click();

  // 품목
  for (let i = 0; i < items.length; i++) {
    const row = i + 1;
    const item = items[i];
    await page.getByRole('textbox', { name: `${row}행 일` }).fill(issueDay);
    await page.getByRole('textbox', { name: `${row}행 품목` }).fill(item.name);
    await page.getByRole('textbox', { name: `${row}행 수량` }).fill(String(item.qty));
    await page.getByRole('textbox', { name: `${row}행 단가` }).fill(String(item.price));
  }

  console.log('Opening 발급미리보기...');
  await page.getByRole('button', { name: '발급미리보기' }).click();

  const issueBtn = page.getByRole('button', { name: '발급하기' });
  await issueBtn.waitFor({ state: 'visible', timeout: 15000 });

  if (!autoYes) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log('\n발급미리보기 화면이 열렸습니다. 브라우저에서 최종 내용을 확인하세요.');
    const answer = await ask(rl, '인증서로 서명하여 최종 발급하시겠습니까? 되돌릴 수 없습니다. (y/N) ');
    rl.close();
    if (answer.trim().toLowerCase() !== 'y') {
      console.log('취소되었습니다. 브라우저에서 직접 처리해주세요.');
      return;
    }
  }

  console.log('발급하기 클릭, 인증서 전자서명 진행...');
  await issueBtn.click();

  await page.locator('iframe[name="dscert"]').locator('a').first().waitFor({ state: 'visible', timeout: 15000 });
  await signWithCertificate(page);

  // 서명 완료 후 발급미리보기/서명 팝업이 닫히는 것을 성공 신호로 사용한다.
  await issueBtn.waitFor({ state: 'hidden', timeout: 30000 });
  console.log('발급 완료. hometax_invoice_list.ts sales 로 발급 내역을 확인하세요.');

  await context.storageState({ path: authFile });
}
