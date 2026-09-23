# 홈텍스 도구

[![홈텍스 자동화](https://img.youtube.com/vi/botX7EATESo/0.jpg)](https://www.youtube.com/watch?v=botX7EATESo)

## 요구사항

- 브라우저 인증서 사용: 인증서 클라우드 연결하기 필요(*)
- 하드디스크 이동식 인증서 사용: OS에 인증서 플러그인 설치 필요(브라우저 인증서가 플러그인 설치가 필요 없어서 편리)

## 설치

```sh
npm install
npx playwright install chrome
```

`.env` 파일 생성:

```
CERT_NAME=인증서이름
CERT_PASSWORD=인증서비밀번호
BUSINESS_NAME=로그인 후 표시되는 사업자명
```

`BUSINESS_NAME`은 발급·취소 스크립트가 실행 전에 로그인된 사업자와 대조하는 값입니다. 다르면(예:
`.env` 사업자 전환을 잊은 경우) 아무것도 발급하지 않고 중단합니다. 발급·취소에는 필수입니다.

인증서 비밀번호를 `.env`에 평문으로 두고 싶지 않다면 `CERT_PASSWORD` 대신 unix `pass`(GPG 기반
패스워드 스토어) 항목을 가리키는 `CERT_PASS_ENTRY`를 사용할 수 있습니다. `CERT_PASSWORD`가 있으면
그 값이 우선 사용되고, 없으면 실행 시점에 `pass show <CERT_PASS_ENTRY>`로 비밀번호를 조회합니다.

```sh
pass insert hometax/사업자이름
```

```
CERT_NAME=인증서이름
CERT_PASS_ENTRY=hometax/사업자이름
BUSINESS_NAME=사업자명
```

## 실행 방법

모든 스크립트는 headless 브라우저로 실행되며(화면 없음), 작업이 끝나면 브라우저를 닫습니다.
로그인 세션은 `google-chrome/` 프로필과 `user.json`에 저장되어 다음 실행에서 재사용됩니다.

### 로그인

```sh
npx tsx hometax_login.ts
```

기존 세션이 있으면 로그아웃한 뒤 `.env`의 인증서로 다시 로그인합니다. 로그인 후 출력되는
`로그인된 사업자`가 의도한 사업자와 다르면 즉시 중단하세요.

### 여러 사업자 전환

`.env` 파일에 사업자별 `CERT_NAME`/`CERT_PASSWORD`(또는 `CERT_PASS_ENTRY`)/`BUSINESS_NAME` 블록을 모두
적어두고, 사용할 블록만 주석 해제(나머지는 `#` 처리)한 뒤 `hometax_login.ts`로 다시 로그인합니다.

```
# CERT_NAME=주식회사 드론맵
# CERT_PASS_ENTRY=hometax/dronemap
# BUSINESS_NAME=주식회사 드론맵

CERT_NAME=은파산업
CERT_PASS_ENTRY=hometax/eunpa
BUSINESS_NAME=은파산업
```

### 세금계산서 조회

```sh
# 매출 + 매입 둘 다 조회 (기본값)
npx tsx hometax_invoice_list.ts both

# 매출만 조회
npx tsx hometax_invoice_list.ts sales

# 매입만 조회
npx tsx hometax_invoice_list.ts purchase

# 복사발급 목록 조회
npx tsx hometax_copy_invoice_list.ts
```

### 세금계산서 PDF 다운로드

```sh
# 승인번호로 찾아서 저장
npx tsx hometax_invoice_pdf.ts 20260922-10260922-75984916 더피치_세금계산서.pdf

# 상호명/사업자번호로 찾아서 저장 (매출 목록, 최근 3개월 범위)
npx tsx hometax_invoice_pdf.ts "주식회사 더피치" ./더피치_세금계산서.pdf

# 매입 세금계산서에서 찾기 (출력경로 생략 시 ./<검색어>.pdf)
npx tsx hometax_invoice_pdf.ts 20260922-10260922-75984916 --type purchase
```

### 세금계산서 발행 미리보기

```sh
# 도움말 (등록된 수신자 목록, 예시 포함)
npx tsx hometax_invoice_create_preview.ts --help

# 발행 예시: 사업자번호 품목명:수량:단가
npx tsx hometax_invoice_create_preview.ts 1498100925 "F450 드론:1:5000" "배터리:2:2000"

# 품목이 많을 때: JSON 파일로 입력
npx tsx hometax_invoice_create_preview.ts 1498100925 --file items.json

# 작성일자 지정: YYYY-MM-DD (기본값: 오늘)
npx tsx hometax_invoice_create_preview.ts 1078641704 "8월 유지보수지급액:1:250000" --date 2026-08-31

# 확인 프롬프트 생략
npx tsx hometax_invoice_create_preview.ts 1498100925 "용역비:1:500000" --yes
```

`--date`는 문서 상단의 작성일자와 품목 행의 월/일에 함께 반영되며, 존재하지 않는 날짜(예: 9월 31일)는
거부합니다. 미리보기 스크립트는 홈택스 입력 폼을 채우고 '발급미리보기'를 연 뒤, 그 화면을 스크린샷
(`/tmp/hometax_invoice_preview.png`)으로 저장하고 종료합니다. 실제 발급은 하지 않습니다.

### 세금계산서 발행 + 최종 제출 (자동 서명)

```sh
# 발급미리보기 이후 '발급하기' 버튼 클릭과 공동·금융인증서 전자서명까지 자동 진행
npx tsx hometax_invoice_create_submit.ts 1078641704 "8월 유지보수지급액:1:250000" --date 2026-08-31

# 모든 확인 없이 바로 최종 발급까지 진행
npx tsx hometax_invoice_create_submit.ts 1078641704 "8월 유지보수지급액:1:250000" --date 2026-08-31 --yes
```

`hometax_invoice_create_submit.ts`는 실제로 상대방에게 전송되는 세금계산서를 발급하며, 되돌릴 수
없습니다. `--yes` 없이 실행하면 (1) 발급 내용 확인, (2) 발급미리보기(스크린샷) 확인 후 인증서 서명 여부,
두 번의 확인을 거칩니다. 로그인된 사업자가 `BUSINESS_NAME`과 다르면 발급 전에 중단하며, 발급 후에는
발급 목록을 다시 조회해 새 승인번호를 출력합니다(찾지 못하면 경고와 함께 종료 코드 1).

### 세금계산서 취소

```sh
# 미리보기: 취소(수정발급) 내용만 확인, 실제 발급/서명 없음
npx tsx hometax_invoice_cancel.ts 20260922-10260922-75984916

# 위 내용을 확인한 뒤 실제로 취소 진행 (인증서 서명까지 자동, 되돌릴 수 없음)
npx tsx hometax_invoice_cancel.ts 20260922-10260922-75984916 --yes
```

당초 세금계산서의 승인번호로 "착오에 의한 이중발급 등" 사유의 수정발급을 진행해, 당초와 동일 금액의
음수(-) 세금계산서를 발급함으로써 전체 취소 처리합니다. `--yes` 없이 실행하면 미리보기 내용만 보여주고
멈추며, 실제 취소는 `--yes`를 붙여 다시 실행해야 진행됩니다. 발행과 마찬가지로 `BUSINESS_NAME` 확인을
거치고, 취소 후에는 비고에 당초 승인번호가 적힌 수정 세금계산서를 목록에서 찾아 승인번호를 출력합니다.

#### items.json 형식

```json
[
  { "name": "품목명", "qty": 1, "price": 500000 },
  { "name": "품목명2", "qty": 2, "price": 30000 }
]
```

## 수신자 관리 (recipients.json)

세금계산서 수신자 정보는 `recipients.json` 파일에서 관리합니다. 키는 사업자번호입니다.

```json
{
  "사업자번호": {
    "name": "상호명",
    "ceo": "대표자명",
    "address": "사업장주소",
    "businessType": "업태",
    "businessItem": "종목",
    "email1": "이메일1@example.com",
    "email2": "이메일2@example.com"
  }
}
```

- `email2`는 생략하거나 빈 문자열(`""`)로 두면 사용되지 않습니다.
- 수신자를 추가/수정할 때는 코드 변경 없이 이 파일만 편집하면 됩니다.

## 테스트 코드 생성 방법

```sh
npx playwright codegen --user-data-dir=/tmp/google-chrome
```
