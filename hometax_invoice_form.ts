import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import * as fs from 'fs';
import * as readline from 'readline';
import { program } from 'commander';
import type { Page } from 'playwright';
import { byIdSuffix } from './hometax_common.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

export interface Invoice {
  bizNo: string;
  recipient: Recipient;
  items: Item[];
  issueMonth: string;
  issueDay: string;
  issueDateStr: string;
  autoYes: boolean;
}

export const parseInvoiceCli = (cli: { name: string; description: string; yesDescription: string; notice?: string }): Invoice => {
  const recipients: Record<string, Recipient> = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'recipients.json'), 'utf-8')
  );
  const now = new Date();
  const lastMonth = now.getMonth().toString();
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  const prevMonthEndStr = `${prevMonthEnd.getFullYear()}-${String(prevMonthEnd.getMonth() + 1).padStart(2, '0')}-${prevMonthEnd.getDate()}`;
  const script = `${cli.name}.ts`;

  program
    .name(cli.name)
    .description(cli.description)
    .argument('[bizNo]', '수신자 사업자번호', '1498100925')
    .argument('[items...]', '품목 목록 (형식: 품목명:수량:단가)')
    .option('-f, --file <path>', '품목 JSON 파일 경로 ([{"name":"...", "qty":1, "price":5000}])')
    .option('-d, --date <date>', '작성일자. YYYY-MM-DD 또는 이번 달의 일(1~31) (기본값: 오늘)')
    .option('-y, --yes', cli.yesDescription)
    .addHelpText('after', `
예시:
  $ npx tsx ${script} 1498100925 "F450 드론:1:5000" "배터리:2:2000"
  $ npx tsx ${script} 1078641704 "${lastMonth}월 유지보수지급액:1:250000" --date ${prevMonthEndStr}
  $ npx tsx ${script} 2108701441 "용역비:1:500000" --date 15
  $ npx tsx ${script} 8788102093 "PCB 자문회의 (${lastMonth}월분):11.5:150000"
  $ npx tsx ${script} 1498100925 --file items.json

등록된 수신자:
${Object.entries(recipients).map(([k, v]) => `  ${k}  ${v.name} (${v.ceo})`).join('\n')}
${cli.notice ? `\n${cli.notice}\n` : ''}`)
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
  }

  const issueDate = parseIssueDate(opts.date, now);
  const pad = (n: number) => String(n).padStart(2, '0');
  const issueDateStr = `${issueDate.getFullYear()}-${pad(issueDate.getMonth() + 1)}-${pad(issueDate.getDate())}`;

  return {
    bizNo,
    recipient,
    items: items!,
    issueMonth: pad(issueDate.getMonth() + 1),
    issueDay: pad(issueDate.getDate()),
    issueDateStr,
    autoYes: opts.yes === true,
  };
};

// "YYYY-MM-DD" 또는 이번 달의 일("15")을 받아 실제로 존재하는 날짜인지 확인한다.
const parseIssueDate = (value: string | undefined, now: Date): Date => {
  if (!value) return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const full = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  const dayOnly = /^\d{1,2}$/.exec(value);
  let y: number, m: number, d: number;
  if (full) {
    [y, m, d] = [Number(full[1]), Number(full[2]), Number(full[3])];
  } else if (dayOnly) {
    [y, m, d] = [now.getFullYear(), now.getMonth() + 1, Number(value)];
  } else {
    console.error(`오류: 작성일자 형식이 잘못되었습니다 "${value}" (YYYY-MM-DD 또는 일)`);
    process.exit(1);
  }
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    console.error(`오류: 존재하지 않는 날짜입니다 "${value}"`);
    process.exit(1);
  }
  return date;
};

const invoiceTotals = (items: Item[]) => {
  const supply = items.reduce((sum, item) => sum + item.qty * item.price, 0);
  const tax = Math.floor(supply * 0.1);
  return { supply, tax, total: supply + tax };
};

// 발급 목록의 한 행이 이 세금계산서(오늘 발급, 같은 수신자·작성일자·첫 품목·합계금액)인지 판단한다.
export const matchesInvoice = (row: Record<string, string>, inv: Invoice): boolean => {
  const digits = (s = '') => s.replace(/\D/g, '');
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return (
    digits(row['공급받는자등록번호(종사업장 번호)']).startsWith(inv.bizNo) &&
    row['작성일자'] === inv.issueDateStr &&
    row['발급일자'] === today &&
    (row['품목명'] ?? '').startsWith(inv.items[0].name) &&
    digits(row['합계금액']) === String(invoiceTotals(inv.items).total)
  );
};

export const savePreviewScreenshot = async (page: Page): Promise<string> => {
  const shot = path.join(os.tmpdir(), 'hometax_invoice_preview.png');
  await page.screenshot({ path: shot, fullPage: true });
  return shot;
};

export const printInvoiceSummary = (inv: Invoice) => {
  const { recipient, bizNo, items } = inv;
  console.log('\n# 세금계산서 발급 내용 확인\n');
  console.log(`수신자: ${recipient.name} (${bizNo})`);
  console.log(`대  표: ${recipient.ceo}`);
  console.log(`주  소: ${recipient.address}`);
  console.log(`이메일: ${recipient.email1}${recipient.email2 ? ', ' + recipient.email2 : ''}`);
  console.log(`\n작성일: ${inv.issueDateStr}`);
  console.log('\n품  목:');
  for (const item of items) {
    console.log(`  ${item.name}  수량: ${item.qty}  단가: ${item.price.toLocaleString()}원  금액: ${(item.qty * item.price).toLocaleString()}원`);
  }
  const { supply, tax, total } = invoiceTotals(items);
  console.log(`\n  공급가액: ${supply.toLocaleString()}원  세액: ${tax.toLocaleString()}원  합계: ${total.toLocaleString()}원`);
};

export const confirm = async (question: string, autoYes: boolean): Promise<boolean> => {
  if (autoYes) {
    console.log(`${question} (y/N) y`);
    return true;
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => rl.question(`${question} (y/N) `, resolve));
  rl.close();
  return answer.trim().toLowerCase() === 'y';
};

// 건별발급 화면으로 이동해 수신자·작성일자·품목을 입력하고 '발급미리보기'를 연다.
export const fillInvoiceForm = async (page: Page, inv: Invoice) => {
  const { recipient, bizNo, items } = inv;

  console.log('Navigating to 전자(세금)계산서 건별발급...');
  await page.getByRole('link', { name: '계산서·영수증·카드' }).click();
  await page.getByRole('link', { name: '전자(세금)계산서 건별발급' }).click();
  await page.waitForLoadState('load');
  await page.waitForTimeout(2000);

  console.log(`Filling out recipient form for ${recipient.name} (${bizNo})...`);
  await page.getByRole('textbox', { name: '등록번호' }).fill(bizNo);
  await page.getByRole('button', { name: '확인' }).click();
  await page.waitForTimeout(500);

  await byIdSuffix(page, 'edtDmnrTnmNmTop').fill(recipient.name);
  await byIdSuffix(page, 'edtDmnrRprsFnmTop').fill(recipient.ceo);
  await page.getByTitle('사업장주소입력').fill(recipient.address);
  await page.getByTitle('업태입력', { exact: true }).fill(recipient.businessType);
  await byIdSuffix(page, 'edtDmnrItmNmTop').fill(recipient.businessItem);

  const [email1Id, email1Domain] = recipient.email1.split('@');
  await byIdSuffix(page, 'edtDmnrMchrgEmlIdTop').fill(email1Id);
  await byIdSuffix(page, 'edtDmnrMchrgEmlDmanTop').fill(email1Domain);

  if (recipient.email2) {
    const [email2Id, email2Domain] = recipient.email2.split('@');
    await byIdSuffix(page, 'edtDmnrSchrgEmlIdTop').fill(email2Id);
    await byIdSuffix(page, 'edtDmnrSchrgEmlDmanTop').fill(email2Domain);
  }

  // 캘린더의 '오늘' 버튼은 항상 오늘 날짜로만 설정되어 --date가 반영되지 않으므로 직접 입력한다.
  await page.getByPlaceholder('yyyy-mm-dd').fill(inv.issueDateStr);
  await page.getByPlaceholder('yyyy-mm-dd').press('Tab');

  for (let i = 0; i < items.length; i++) {
    const row = i + 1;
    const item = items[i];
    // '월'은 보통 작성일자에서 자동 입력되지만, 입력 가능한 경우엔 명시적으로 맞춘다.
    const monthBox = page.getByRole('textbox', { name: `${row}행 월` });
    if (await monthBox.isEditable({ timeout: 1000 }).catch(() => false)) {
      await monthBox.fill(inv.issueMonth);
    }
    await page.getByRole('textbox', { name: `${row}행 일` }).fill(inv.issueDay);
    await page.getByRole('textbox', { name: `${row}행 품목` }).fill(item.name);
    await page.getByRole('textbox', { name: `${row}행 수량` }).fill(String(item.qty));
    await page.getByRole('textbox', { name: `${row}행 단가` }).fill(String(item.price));
  }

  console.log('Opening 발급미리보기...');
  await page.getByRole('button', { name: '발급미리보기' }).click();
};
