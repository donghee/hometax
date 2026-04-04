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
