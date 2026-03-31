# 홈텍스 도구

## 요구사항

- 브라우저 인증서 필요
- 인증서 클러우드 로그인 필요
- 하드디스크 이동식 인증서 사용할려면 브라우저 플러그인 설치 필요(그래서 브라우저 인증서가 편리) 


## 실행 방법

홈텍스 로그인

```sh
npx tsx hometax_login.ts
```

테스크 코드 생성 

```sh
npx playwright codegen --user-data-dir=/tmp/google-chrome
```
