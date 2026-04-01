# 홈텍스 도구

[![홈텍스 자동화](https://img.youtube.com/vi/botX7EATESo/0.jpg)](https://www.youtube.com/watch?v=botX7EATESo)

## 요구사항

- 브라우저 인증서 사용: 인증서 클라우드 연결하기 필요(*)
- 하드디스크 이동식 인증서 사용: OS에 인증서 플러그인 설치 필요(브라우저 인증서가 플러그인 설치가 필요 없어서 편리) 

## 실행 방법

홈텍스 로그인

```sh
npx tsx hometax_login.ts
```

매출/매입 세금 계산서 목록

```sh
npx tsx hometax_invoice_list.ts
```

세금 계산서 작성

```sh
npx tsx hometax_invoice_create.ts
```

## 테스크 코드 생성 방법

```sh
npx playwright codegen --user-data-dir=/tmp/google-chrome
```
