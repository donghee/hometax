---
name: hometax
description: hometax.go.kr에서 제공하는 세금계산서 조회 및 작성하는 도구 
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

```bash
# 발행된 매출/매입 세금계산서 조회
npx tsx hometax_invoice_list.ts
```

```bash
# 발행된 복사 세금계산서 조회
npx tsx hometax_copy_invoice_list.ts
```


```bash
# 세금계산서 발행 도움말: 예시, 등록된 수신자 목록 제공
npx tsx hometax_invoice_create.ts
```

```bash
# 세금계산서 발행 예시: 주식회사 드론맵 사업자에 2건의 품목에 대해 세금계산서 작성
npx tsx hometax_invoice_create.ts 1498100925 "F450 드론:1:5000" "배터리:2:2000"
```
