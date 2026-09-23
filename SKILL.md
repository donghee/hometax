---
name: hometax
description: hometax.go.kr에서 제공하는 홈텍스 세금계산서 조회 및 작성하는 도구 
allowed-tools: Bash
---

# Hometax Assistant

> hometax.go.kr에서 제공하는 세금계산서 조회 및 작성하는 명령어 도구

## Quick start

### Step 1: 도구 설치 위치 이동

```bash
cd /home/donghee/src/github.com/donghee/hometax
```

### Step 2: 도구 사용 예시

#### hometax 로그인

```bash
# hometax 로그인 (headless). 기존 세션이 있으면 로그아웃 후 .env의 인증서로 다시 로그인
npx tsx hometax_login.ts
```

주의사항: 로그인 후 출력되는 `로그인된 사업자`가 의도한 사업자와 다르면 즉시 중단하고 사용자에게 알릴 것.

모든 스크립트는 headless로 실행되고 끝나면 브라우저를 닫는다. 발행 스크립트는 실행에 1~3분 걸리므로 Bash 타임아웃을 넉넉히(180초 이상) 줄 것.
이전 실행을 강제 중단해 `ProcessSingleton`(프로필 잠금) 오류가 나면, 남은 chrome 프로세스를 종료하고 `google-chrome/Singleton*` 파일을 지운 뒤 다시 실행한다.

#### 사업자 전환 (여러 사업자 사용 시)

`.env` 파일에 사업자별 `CERT_NAME`/`CERT_PASSWORD`/`BUSINESS_NAME` 블록을 모두 적어두고, 쓸 블록만 주석 해제(나머지는 `#` 처리)한 뒤 `hometax_login.ts`로 다시 로그인한다.
`BUSINESS_NAME`은 로그인 후 표시되는 사업자명으로, 발급·취소 스크립트가 로그인된 사업자와 다르면 중단하는 안전장치다(발급·취소에 필수).

인증서 비밀번호를 `.env`에 평문으로 두지 않으려면 `CERT_PASSWORD` 대신 `CERT_PASS_ENTRY`를 사용해 unix `pass`(GPG 기반 패스워드 스토어) 항목을 참조할 수 있다. `CERT_PASSWORD`가 설정돼 있으면 그 값이 우선 사용되고, 없으면 실행 시점에 `pass show <CERT_PASS_ENTRY>`로 비밀번호를 조회한다.

```bash
# 사업자별 비밀번호를 pass에 저장 (최초 1회)
pass insert hometax/드론맵
pass insert hometax/더피치
```

```dotenv
# .env: 사업자별 블록 중 쓸 블록만 주석 해제
# CERT_NAME=주식회사 드론맵
# CERT_PASS_ENTRY=hometax/dronemap
# BUSINESS_NAME=주식회사 드론맵

CERT_NAME=박동희()001168720180313111005385
CERT_PASS_ENTRY=hometax/eunpa
BUSINESS_NAME=은파산업
```

#### 세금계산서 조회

```bash
# 발행된 매출 세금계산서, 매입 세금계산서 둘다 조회
npx tsx hometax_invoice_list.ts both
```

```bash
# 발행된 매출 세금계산서 조회
npx tsx hometax_invoice_list.ts sales
```

```bash
# 발행된 매입 세금계산서 조회
npx tsx hometax_invoice_list.ts purchase
```

```bash
# 발행된 복사 세금계산서 조회
npx tsx hometax_copy_invoice_list.ts
```


주의사항: 세금계산서 조회 하기 전에 'hometax 로그인' 실행해서 출력되는 `로그인된 사업자`가 의도한 사업자와 다르면 즉시 중단하고 사용자에게 알릴 것.

#### 세금계산서 PDF 다운로드

```bash
# 승인번호, 사업자번호, 상호명 중 하나로 목록에서 찾아 PDF로 저장 (기본: 매출 목록, 최근 3개월)
npx tsx hometax_invoice_pdf.ts 20260922-10260922-75984916 더피치_세금계산서.pdf

# 매입 세금계산서에서 찾을 때 (출력경로 생략 시 ./<검색어>.pdf)
npx tsx hometax_invoice_pdf.ts <검색어> [출력경로] --type purchase
```

#### 세금계산서 발행

세금계산서 발행 요청을 받으면 기본으로는 `hometax_invoice_create_preview.ts`로 미리보기만 실행한다.
내용을 사용자에게 보여주고 제출 여부를 물은 뒤, 사용자가 제출을 승인하면 그때 `hometax_invoice_create_submit.ts`를 실행한다.
미리보기 화면은 `/tmp/hometax_invoice_preview.png`에 저장되므로 Read로 확인해 작성일자·품목·금액을 사용자에게 보여줄 것.

작성일자는 `--date YYYY-MM-DD`로 지정한다(다른 형식은 거부됨). 생략하면 오늘. 사용자가 날짜를 말하면 반드시 `--date`에 반영하고, 미리보기 스크린샷에서 상단 작성일자가 맞는지 확인할 것.

```bash
# 1) 미리보기 (기본 동작, 실제 발급/서명 없음)
npx tsx hometax_invoice_create_preview.ts 1498100925 "F450 드론:1:5000" "배터리:2:2000" --date 2026-09-15 --yes

# 2) 사용자가 제출을 승인한 경우에만 실행 (인증서 서명까지 자동 진행, 되돌릴 수 없음)
npx tsx hometax_invoice_create_submit.ts 1498100925 "F450 드론:1:5000" "배터리:2:2000" --date 2026-09-15 --yes
```

제출 스크립트는 발급 후 목록을 다시 조회해 `발급 완료: 승인번호 ...`를 출력한다. 이 줄이 없거나 경고가 나오면 `hometax_invoice_list.ts sales`로 확인할 것.

#### 세금계산서 취소

취소 요청도 발행과 동일하게: 기본은 미리보기만 실행해 내용을 보여주고, 사용자가 승인하면 `--yes`로 실제 취소를 진행한다.

```bash
# 1) 미리보기 (기본 동작, 실제 취소/서명 없음)
npx tsx hometax_invoice_cancel.ts 20260922-10260922-75984916

# 2) 사용자가 승인한 경우에만 실행 (인증서 서명까지 자동 진행, 되돌릴 수 없음)
npx tsx hometax_invoice_cancel.ts 20260922-10260922-75984916 --yes
```

"착오에 의한 이중발급 등" 사유로 수정발급하여 당초와 동일 금액의 음수(-) 세금계산서를 발급함으로써 전체 취소한다.
취소 후에는 `취소 완료: 수정 승인번호 ...`를 출력한다.
