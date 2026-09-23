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
```

## 실행 방법

### 로그인

```sh
npx tsx hometax_login.ts
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

# 매입 세금계산서에서 찾기
npx tsx hometax_invoice_pdf.ts 20260922-10260922-75984916 매입건.pdf --type purchase
```

### 세금계산서 발행

```sh
# 도움말 (등록된 수신자 목록, 예시 포함)
npx tsx hometax_invoice_create.ts --help

# 발행 예시: 사업자번호 품목명:수량:단가
npx tsx hometax_invoice_create.ts 1498100925 "F450 드론:1:5000" "배터리:2:2000"

# 품목이 많을 때: JSON 파일로 입력
npx tsx hometax_invoice_create.ts 1498100925 --file items.json

# 작성일 지정 (일만 입력, 기본값: 오늘)
npx tsx hometax_invoice_create.ts 1498100925 "용역비:1:500000" --date 25

# 확인 프롬프트 생략
npx tsx hometax_invoice_create.ts 1498100925 "용역비:1:500000" --yes
```

발행 전에 내용 확인 후 `y`를 입력해야 실제로 발급됩니다. `hometax_invoice_create.ts`는 '발급미리보기'
단계까지만 자동화하고, 실제 최종 발급(제출)은 열린 브라우저에서 직접 진행합니다.

### 세금계산서 발행 + 최종 제출 (자동 서명)

```sh
# 발급미리보기 이후 '발급하기' 버튼 클릭과 공동·금융인증서 전자서명까지 자동 진행
npx tsx hometax_invoice_create_submit.ts 1078641704 "8월 유지보수지급액:1:250000"

# 모든 확인 없이 바로 최종 발급까지 진행
npx tsx hometax_invoice_create_submit.ts 1078641704 "8월 유지보수지급액:1:250000" --yes
```

`hometax_invoice_create_submit.ts`는 실제로 상대방에게 전송되는 세금계산서를 발급하며, 되돌릴 수
없습니다. `--yes` 없이 실행하면 (1) 발급 내용 확인, (2) 발급미리보기 확인 후 인증서 서명 여부, 두
번의 확인을 거칩니다.

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
