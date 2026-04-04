import path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs';
import * as readline from 'readline';
import { program } from 'commander';
import type { Page } from 'playwright';
import { launchContext, loginWithRetry, authFile } from './hometax_common.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const recipients: Record<string, Recipient> = {
  '8788102093': {
    name: '주식회사 크래이징랩',
    ceo: '김상표',
    address: '경기도 화성시 동탄기흥로 557, 406호(영천동, 금강펜테리움IT타워)',
    businessType: '정보통신업',
    businessItem: 'AI개발',
    email1: 'yurim@wom.ai',
    email2: ''
  },
  '1078641704': {
    name: '(주) 인코칭',
    ceo: '김재은',
    address: '서울특별시 서초구 방배로20길 17(방배동, 인코칭빌딩)',
    businessType: '서비스업',
    businessItem: '응용소프트웨어개발',
    email1: 'support@incoaching.com',
    email2: 'kes@incoaching.com'
  },
  '1498100925': {
    name: '주식회사 드론맵',
    ceo: '박동희',
    address: '서울시 구로구 부일로 15가길 3 나동 401호',
    businessType: '서비스',
    businessItem: '소프트웨어 및 하드웨어',
    email1: 'dongheepark@gmail.com',
    email2: 'dongheepark1@gmail.com'
  }
};

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

program
  .name('hometax_invoice_create')
  .description('홈택스 전자세금계산서 발급 CLI')
  .argument('[bizNo]', '수신자 사업자번호', '1498100925')
  .argument('[items...]', '품목 목록 (형식: 품목명:수량:단가)')
  .option('-f, --file <path>', '품목 JSON 파일 경로 ([{"name":"...", "qty":1, "price":5000}])')
  .option('-d, --date <day>', '작성일 (일, 1~31)', todayDay)
  .option('-y, --yes', '확인 없이 바로 발급')
  .addHelpText('after', `
예시:
  $ npx tsx hometax_invoice_create.ts 1498100925 "F450 드론:1:5000" "배터리:2:2000"
  $ npx tsx hometax_invoice_create.ts 1078641704 "${lastMonth}월 유지보수지급액:1:250000"
  $ npx tsx hometax_invoice_create.ts 8788102093 "PCB 자문회의 (${lastMonth}월분):11.5:150000"
  $ npx tsx hometax_invoice_create.ts 1498100925 --file items.json

등록된 수신자:
${Object.entries(recipients).map(([k, v]) => `  ${k}  ${v.name} (${v.ceo})`).join('\n')}
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

// 발급 전 확인 프롬프트
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
console.log('\n---\n');

const autoYes = opts.yes === true;

if (autoYes) {
  console.log('위 내용으로 발급하시겠습니까? (y/N) y');
  await main();
} else {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('위 내용으로 발급하시겠습니까? (y/N) ', async (answer) => {
    rl.close();
    if (answer.trim().toLowerCase() !== 'y') {
      console.log('취소되었습니다.');
      process.exit(0);
    }
    await main();
  });
}

async function main() {
  const context = await launchContext({ headless: false, timeout: 60000 * 60 });
  const page = await context.newPage();
  console.log('Browser launched, trying to log in...');
  await loginWithRetry(page);

  console.log('Login successful, navigating to copy invoice page...');
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

  await page.getByRole('button', { name: '발급미리보기' }).click();

  await context.storageState({ path: authFile });
}
