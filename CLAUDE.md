# CLAUDE.md

## 먼저 읽을 것

이 저장소의 상세 개발 규칙은 [AGENTS.md](AGENTS.md)에 있다. 구현 전 해당 문서의 상태·음악 시간·오디오·스타일 불변 조건을 따른다.

## 빠른 시작

```sh
npm install
npm run dev
npm run build
```

Node.js 22 이상이 필요하다.

## 구현 원칙

- React/TypeScript 코드에서는 기존 단일 전역 연습 상태를 확장한다. 페이지별로 키, BPM, 진행, 박자 상태를 따로 만들지 않는다.
- 코드 진행·코드톤·재생 위치는 `src/harmony.ts`의 `chordIntervals`, `progressionTimeline`, `progressionPosition`을 사용한다.
- 리듬 시간은 ♩ 기준 BPM과 16분음표 틱 규칙을 유지한다. 새 박자나 프리셋은 `src/rhythm.ts`에 데이터와 계산을 함께 추가한다.
- 다중 스트로크 행은 행별 박자표·강세·방향을 보존하고, 리듬 재생 시 모든 행을 순차 반복한다. 선택된 행은 편집과 공통 설정의 기준이다.
- 하단 전송 바의 리듬훈련·잼플레이·메트로놈 동시 재생 토글은 각각 다중 리듬 패턴 타임라인, 코드 진행 반주, 클릭을 다른 도구와 함께 실행하며, 설정과 세션에 저장한다.
- 이 세 토글은 각 화면(리듬훈련·잼플레이·메트로놈)의 플레이/멈춤 버튼과 같은 상태다. 화면 버튼과 토글은 모두 `toggleTool`을 호출하고, 각 화면의 "재생 중" 표시는 `playing && 해당 토글`로 판단한다. 전송 바의 "연습 재생"은 현재 화면의 도구를 포함해 켜진 토글을 한 번에 재생한다.
- 반주·음 미리 듣기의 음색은 `src/audio.ts`의 `INSTRUMENTS` 엔진(`AudioConfig.instrument`, 기본 `synth`)으로 고른다. `synth`는 합성음, `studio`·`live`·`street`·`room`은 각각 `ENGINE_FOLDERS`가 가리키는 `public/instruments/`의 베이스·기타 녹음 샘플이며 로드 전에는 `pluck`로 대체된다. 피치 보이스는 `voice()`에서 분기하고, 샘플 로드(`loadEngine`)는 사용자 동작·재생 후에만 트리거한다. 새 샘플은 재배포 가능 라이선스만 쓰고 `public/instruments/CREDITS.md`에 출처를 남긴다. 설정·세션에 저장한다.
- 잼플레이 반주 스타일은 `src/audio.ts`의 `JAM_STYLES` 데이터로 정의한다. 각 스타일은 베이스·코드를 16분음표 격자(`on`=박 안 위치, `beats`=마디 안 박 선택, `seq`=베이스 반음 순환, `hold`/`strum`/`arp`)에 배치하는 규칙이며, 스케줄러는 이 표만 읽는다. 새 장르는 여기에 데이터로 추가하고, 프리셋(`src/rhythm.ts`)이 참조하는 기존 id(`Rock`·`Pop`·`Ballad`·`Funk`)는 유지한다. 스타일 문자열은 `isJamStyleId`로 검증한다.
- 브라우저 저장 데이터는 이전 버전과 호환돼야 한다. 새 필드는 선택적으로 읽고 정규화한다.
- 일일 연습 시간은 로컬 날짜별 저장 키와 자정 초기화를 유지하고, 목표 시간은 `dailyGoalMinutes` 설정으로 저장한다.
- 라이트·다크 테마와 선택 가능한 컬러 톤을 유지한다. 기본 테마는 다크, 기본 컬러 톤은 White(`#f8f9fa`)이며, CSS 토큰과 `color-mix()`를 통해 모든 강조색과 배경을 연결한다. White는 라이트 테마에서 충분한 대비를 유지하도록 블루그레이 강조색으로 보정한다.
- 기본 글꼴은 Noto Sans KR, 최소 표기 크기는 16px이다. 모바일에서는 글꼴을 축소하지 않고 레이아웃을 재배치한다.
- 프렛보드에서는 KEY 코드톤과 현재 잼 코드톤의 시각적 역할을 다르게 유지한다. CAGED 모드의 폼 구조를 코드톤 표시 때문에 확장하지 않는다.

## 완료 전 확인

타브 생성은 App의 `songMode`·`playing`, `TabStudio.tsx`, `tablature.ts`, `songAudio.ts`와 로컬 `server/`가 연결한다. 곡 모드와 합성 반주는 상호 배타적이며 마스터 버스만 공유한다. 타브 생성 화면은 로컬 서버 로그인 후에만 열린다. 계정은 서버의 `account.json`(단일 계정, 아이디/비밀번호 해시)에 저장하고 `/api/auth*`가 관리하며, `/api/projects*`는 인증을 요구한다. 원곡의 초 단위 시간축과 실제 박 위치를 보존하고, 자동 분석/사용자 편집은 별도 저장한다. 상세 규칙과 서버 설치는 AGENTS.md와 README.md를 따른다. 타브 변경 시 `npm run check:tab`, 서버 변경 시 `python server/check_pipeline.py`를 실행한다. Playwright는 실행하지 않는다.

```sh
npx prettier --write src
npm run build
```

사용자에게는 변경 내용과 빌드 결과만 간결하게 보고한다.
