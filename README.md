# paperclip-korean-ui

Paperclip 공식 dist를 고치지 않고 크롬 UI를 한국어로 덮는다.

- 기본 언어: 한국어
- 상단 `한 | EN` 토글, `localStorage paperclip.uiLanguage`
- 문구 정본: `locales/chrome.ko.json`, `locales/skills.ko.json`.

설정 화면(일반·실험·멤버·시크릿 등)은 `chrome.ko.json`의 `settings` 섹션이다. 짧은 단어(General, Access)는 설정 경로에서만 바꾼다.

## 빌드·설치

```sh
git clone https://github.com/AoomORG/paperclip-korean-ui.git
cd paperclip-korean-ui
# Node >= 24.11
npm ci
npm run build
```

그다음 Paperclip에 로컬 경로로 설치한다. 로컬 경로는 개발용이다. 배포용 npm 패키지 공개는 아직 하지 않는다.

Node.js 24.11 이상이 필요하다. SDK는 현재 검증한 Paperclip과 같은 `2026.831.1`에 고정한다. 다른 버전의 호환성은 별도로 확인한다. 개인 npm 캐시나 회사 DB는 설치에 필요하지 않다.

패키지 파일은 `npm pack`으로 만든다. 빌드가 먼저 실행되며 dist·README·패키지 설정만 포함한다. 소스 레포에는 src·locales·빌드 스크립트·lockfile을 보관한다. npm 공개 배포는 아직 하지 않는다.

스킬 파일(`SKILL.md`)은 번역하지 않는다. 화면에 보이는 설명만 카탈로그가 있으면 한글로 바꾼다.
