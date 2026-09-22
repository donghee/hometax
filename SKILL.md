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
# hometax 로그인, chrome headed 모드로 실행
npx tsx hometax_login.ts
```

#### 사업자 전환 (여러 사업자 사용 시)

`.env` 파일에 사업자별 `CERT_NAME`/`CERT_PASSWORD` 블록을 모두 적어두고, 쓸 블록만 주석 해제(나머지는 `#` 처리)해서 전환한다.

주의사항: `.env` 파일을 직접 읽거나 수정하지 않는다!. 사업자 전환이 필요하면 사용자에게 `.env`에서 어떤 블록을 주석 해제해야 하는지 안내만 하고, 실제 수정은 사용자가 직접 한다.

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

#### 세금계산서 PDF 다운로드

```bash
# 승인번호, 사업자번호, 상호명 중 하나로 목록에서 찾아 PDF로 저장 (기본: 매출 목록, 최근 3개월)
npx tsx hometax_invoice_pdf.ts 20260922-10260922-75984916 더피치_세금계산서.pdf

# 매입 세금계산서에서 찾을 때
npx tsx hometax_invoice_pdf.ts <검색어> <출력경로> --type purchase
```

#### 세금계산서 발행

```bash
# 세금계산서 발행 도움말: 예시, 등록된 수신자 목록 제공
npx tsx hometax_invoice_create.ts
```

주의 사항: 세금 계산서 발행 전에 발행할 세금계산서 정리해서 보여주고, 발행 진행할지 확인 필요.

```bash
# 세금계산서 발행 예시: 주식회사 드론맵 사업자에 2건의 품목에 대해 세금계산서 작성
npx tsx hometax_invoice_create.ts 1498100925 "F450 드론:1:5000" "배터리:2:2000"
```
