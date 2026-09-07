# JamBridge 개발 가이드

## 프로젝트 개요

JamBridge는 React 19, TypeScript, Vite, Web Audio API로 만든 한국어 일렉기타 연습 앱이다. 프렛보드, 리듬훈련, 잼플레이, 메트로놈이 **하나의 연습 상태**를 공유한다. Node.js 22 이상을 사용한다.

## 필수 명령

```sh
npm install
npm run dev
npm run build
```

- 개발 서버 기본 주소는 `http://localhost:5173`이다.
- `npm run build`는 TypeScript 검사와 프로덕션 빌드를 함께 수행한다.
- 변경 후에는 `npx prettier --write`와 `npm run build`로 검증한다. 타브 변경은 `npm run check:tab`, 서버 변경은 `python server/check_pipeline.py`로 확인한다. 실제 모델은 `--models` 옵션으로 별도 검증한다. Playwright를 사용하지 않는다.

## 소스 책임

| 경로                                      | 책임                                                           |
| ----------------------------------------- | -------------------------------------------------------------- |
| `src/App.tsx`                             | 전역 연습 상태, 페이지 전환, 저장·복원, 프렛보드, 공통 컨트롤  |
| `src/audio.ts`                            | Web Audio 스케줄러, 클릭·드럼·베이스·코드 합성                 |
| `src/music.ts`                            | 음이름, 스케일, 코드 종류, CAGED, 음높이 기초 데이터           |
| `src/harmony.ts`                          | 코드 검증·파싱·조옮김·공유 타임라인                            |
| `src/JamHarmony.tsx`, `src/harmony.css`   | 진행 라이브러리, 고급 코드 편집, JSON 교환                     |
| `src/rhythm.ts`                           | 박자표, 강세 묶음, 다중 스트로크 행·방향, 프리셋, 마이그레이션 |
| `src/RhythmPresets.tsx`, `src/rhythm.css` | 장르별 리듬 프리셋 UI                                          |
| `src/styles.css`                          | 전역 레이아웃, 반응형, 프렛보드, 다크 파스텔 레드 토큰         |

원본 참고 PNG는 프로젝트 루트에 보존한다. 기능을 만들 때 참고는 하되 원본을 수정하거나 제거하지 않는다.

## 핵심 불변 조건

### 공유 상태와 저장

- 키, 스케일, BPM, 박자표, 강세 묶음, 진행, 리듬 패턴, 믹서는 `App.tsx`의 단일 상태를 통해 연결한다. 화면마다 복제 상태를 만들지 않는다.
- 전역 설정은 `jambrigde-settings`, 전체 세션은 `jambrigde-sessions`, 사용자 진행은 `jambrigde-progressions`에 저장된다.
- 오늘의 연습 시간은 `src/practice.ts`를 통해 로컬 날짜별 `jambrigde-time-YYYY-MM-DD`에 저장한다. 자정에 0으로 초기화되므로 사용자에게 보이는 시간에 UTC 날짜를 사용하지 않는다.
- 일일 목표 시간은 `jambrigde-settings`의 `dailyGoalMinutes`로 유지한다. 허용값 검증과 기본값 20분을 보존하고, 시간을 수동 초기화해도 목표 설정은 바꾸지 않는다.
- 저장 형식을 확장할 때는 기존 데이터가 안전하게 읽히도록 선택 필드와 정규화 경로를 유지한다. 리듬 설정은 `normalizeRhythmState`를 통해 이전 형식도 복원한다.
- `localStorage` 접근은 예외가 나도 연습 화면이 계속 동작해야 한다.

### 음악 시간과 코드

- BPM과 코드의 `beats`는 항상 **4분음표(♩) 기준**이다.
- 오디오 틱은 16분음표 기준이다. 박자표의 단계 수와 묶음은 `meterInfo`, `rhythmPosition`, `groupStarts`를 사용해 계산한다.
- 스트로크 패턴 행은 각자 `meter`, `grouping`, `pattern`, `directions`를 가지며, 리듬 재생은 모든 행을 순서대로 반복한다. 선택한 행은 편집과 공통 설정의 기준이며 재생 순서 자체를 제한하지 않는다.
- 하단 전송 바의 `rhythmTraining`·`jamTraining`·`click`은 각각 리듬훈련·잼플레이·메트로놈 레이어의 재생 여부다. 오디오 스케줄러는 오직 이 세 플래그로 각 레이어를 켠다(`audioPage` 기반 강제 재생은 없다). 활성화하면 다중 패턴 타임라인·드럼 설정, 코드 진행·베이스·코드 반주를 공유하고, 설정·세션에 함께 저장한다.
- 이 세 플래그는 전송 바의 동시 재생 토글이자 각 화면의 플레이/멈춤 상태다. 토글과 화면 버튼은 모두 `toggleTool`을 호출하며(마지막 도구를 끄면 `playing`도 내린다), 화면별 "재생 중" 표시는 `playing && 해당 플래그`(`jamActive`·`rhythmActive`·`clickActive`)로 판단한다. 전송 바 "연습 재생"(`startTransport`)은 현재 화면의 도구를 포함해 켜진 플래그를 함께 재생한다.
- 잼 코드톤 위치는 `jamActive`가 아닐 때 마지막 재생 틱(`jamFreezeTick`)에서 멈춘다.
- 각 칸의 `directions`는 `down` 또는 `up`이다. 기본 교차 방향은 `defaultDirections`, 박자 변경 시 길이 보정은 `fitDirections`를 사용한다.
- 진행의 화면 표시와 오디오 전환은 모두 `progressionTimeline`과 `progressionPosition`을 사용한다. 별도 타임라인 계산을 만들지 않는다.
- `Chord`의 `root`와 `bass`는 0–11, 커스텀 `intervals`는 0–24의 정수다. 코드톤이 필요하면 `chordIntervals`를 사용하고 `custom` 코드를 메이저 코드로 대체하지 않는다.
- 조옮김 시 슬래시 베이스도 `transposeChord`로 함께 이동한다.

### 오디오

- Web Audio는 사용자 동작 이후에만 시작한다. 재생 중 새 설정이 적용되는 방식은 기존 스케줄러의 `AudioConfig`와 재생 재시작 규칙을 따른다.
- 클릭·드럼·반주 타이밍을 변경하면 요청 박자(특히 5/8, 7/8, 12/8)와 강세 묶음의 실제 시간 간격을 테스트한다.
- 음 미리 듣기와 전체 재생은 마스터 볼륨·음소거 상태를 공유해야 한다.
- 음색 엔진은 `AudioConfig.instrument`(`INSTRUMENTS`, 기본 `synth`)로 고른다. `synth`는 기존 오실레이터 합성음이고, `studio`·`live`·`street`·`room`은 `ENGINE_FOLDERS`가 지정한 `public/instruments/`의 베이스·기타 녹음 샘플(FluidR3_GM 발췌, MIT)을 쓴다. 피치 보이스는 `voice()`에서 분기하고, 샘플 엔진은 해당 폴더의 `Sampler`가 로드되기 전에는 `pluck`(Karplus–Strong)로 대체한다. 샘플은 3반음 간격만 담고 `playbackRate`로 보간한다. 드럼·클릭은 엔진과 무관하게 동일하다. 녹음 샘플은 감쇠하므로 오실레이터와 같은 체감 음량이 되도록 `sample()`·`pluck()`에서 이득을 올리고, 마스터 버스의 리미터(`DynamicsCompressorNode`)가 겹친 피크의 클리핑을 막는다.
- 샘플 로드는 사용자 동작(음색 버튼 클릭) 또는 재생 시작 후에만 엔진 단위로 트리거한다(`audio.loadEngine`). 로드 실패 시 합성음 대체를 유지하고 사용자에게 알린다. 설정·세션에 저장하고 이전 데이터는 선택 필드로 읽는다.
- 새 샘플/사운드폰트를 추가하면 재배포 가능한 라이선스(CC0·MIT·CC-BY 등)만 쓰고 `public/instruments/CREDITS.md`에 출처를 남긴다.
- 잼플레이 반주 스타일은 `JAM_STYLES` 데이터로 정의한다(베이스·코드의 16분음표 배치: `on`·`beats`·`seq`·`hold`·`strum`·`arp`). 스케줄러는 이 표만 읽고 스타일별 `if` 분기를 두지 않는다. 새 장르는 데이터로 추가하며 프리셋이 쓰는 id(`Rock`·`Pop`·`Ballad`·`Funk`)는 보존하고, 저장값은 `isJamStyleId`로 검증한다. 프리셋 없이 재생하는 잼 반주의 드럼은 `src/rhythm.ts`의 `STYLE_DRUMS`(4/4 한정)에서 스타일별로 고른다.

### 프렛보드

- 프렛보드는 현재 KEY의 토닉 코드톤과 잼플레이의 현재 코드톤을 함께 표시한다.
- 현재 잼 코드톤은 재생 틱에서 계산한 `progressionPosition`을 기준으로 갱신한다. 정지 시 진행의 첫 코드가 기준이다.
- 일시정지는 마지막 재생 틱을 보존해 프렛보드의 JAM 코드톤이 현재 코드에 그대로 머물러야 한다.
- KEY 코드톤과 잼 코드톤은 클래스와 색을 구분한다. 공통 음은 잼 코드톤의 밝기와 KEY 테두리를 함께 유지한다.
- 프렛보드 범례의 근음·구성음·잼·KEY 항목은 실제 지판 색상과 같은 토큰을 사용한다. 토글을 끄면 해당 범주는 숨기지 않고 일반 노트 표시로 되돌린다.
- CAGED 모드는 선택 폼의 구조를 우선한다. 코드톤 오버레이가 폼 밖의 음을 추가해 CAGED 레이아웃을 깨뜨리면 안 된다.

## UI, 접근성, 반응형

### 타브 생성

- `src/TabStudio.tsx`의 훅이 App의 전역 `songMode`·`playing`과 연결한다. `src/songAudio.ts`는 공통 AudioContext와 마스터 버스를 사용하고 15초 청크를 동기 스케줄링한다. 곡 모드에서는 합성 반주를 실행하지 않는다. 재생 위치는 원곡 초 기준이며 화면 전환/일시정지로 초기화하지 않는다.
- `src/tablature.ts`는 타브 타입·운지 경로 탐색·실제 박 위치의 마디 매핑을 담당한다. 튜닝은 1번 줄부터 MIDI로 저장하며 fret은 실제 프렛, UI 숫자는 카포 기준이다. 불가능한 음은 삭제/옥타브 이동 없이 미배치로 유지한다. 주법은 추정과 사용자 확정을 구분한다.
- `server/app.py`는 로컬 전용 FastAPI와 취소 가능한 작업 수명, `worker.py`는 Demucs/Basic Pitch/librosa, `schemas.py`는 편집 데이터 검증을 담당한다. 원본 결과와 수동 편집은 별도 파일이다. 최초 분석 전 저장이 이후 모델 결과를 가리면 안 된다. 저장 형식은 version 1이며 프로젝트 ID는 UUID로 검증한다.
- `gate` 미들웨어는 `Origin` 호스트네임이 루프백이거나 `JAMBRIDGE_ALLOWED_HOSTS`(콤마 구분, `*`=전체)에 있을 때만 통과시킨다. 기본값은 `localhost`/`127.0.0.1`/`::1`. LAN·도메인 배포는 이 변수로 호스트를 등록한다.
- `/api/projects*`는 로그인 후에만 접근 가능하다. 계정은 `account.json`(단일 계정, PBKDF2 해시)에 저장하고, `/api/auth`(상태)·`/api/auth/register`·`/api/auth/login`·`/api/auth/logout`이 관리하며 토큰은 서버 메모리 세션이다. 프런트는 `useTabSong`이 인증 상태를 들고 있고, `TabStudio`는 미로그인 시 `TabLogin` 폼만 렌더한다. `src/tablature.ts`의 `api()`와 `authHeaders()`는 `jambrigde-tab-auth` 토큰을 `Authorization` 헤더로 실어 보내고, `api()`는 401이면 `AuthError`를 던진다. stem 오디오를 직접 `fetch`하는 `songAudio.ts`도 `authHeaders()`를 쓴다.
- 오디오·모델·결과는 `server/data`(또는 `JAMBRIDGE_DATA`)에 저장하고 브라우저에는 `jambrigde-tab-current`와 세션 참조만 둔다. 모델 다운로드는 사용자의 분석 시작 후에만 발생한다. 서버는 `npm run server`로 127.0.0.1:8000에서 실행하며 Vite `/api` 프록시가 연결한다.
- 타브는 마디별 반응형 배치를 사용하고 음이 많은 마디만 내부 가로 스크롤을 허용한다. 기본 최소 글꼴 16px을 유지한다. 모델의 추정 결과와 실제 악보/주법을 동일시하지 않는다.

- 기본 글꼴은 `Noto Sans KR`이며, 표시 글꼴 크기는 16px 미만으로 만들지 않는다. 작은 화면에서도 별도 축소 글꼴을 만들지 말고, 영역을 줄바꿈·세로 배치·스크롤로 조정한다.
- UI는 라이트·다크 테마를 지원하며, 기본 테마는 다크이고 기본 컬러 톤은 White(`#f8f9fa`)다. `colorTone` 설정의 15개 선택값과 `themeMode`의 `dark`·`light`만 허용한다. 새 UI 색은 `--accent`, `--coral`, `--mint`, `--tone-dark`, `--tone-light`과 `color-mix()`를 사용하며, White는 라이트 테마에서 대비용 블루그레이 강조색으로 보정한다.
- KEY 코드톤 전용 색은 `--key-tone-*`, 잼 코드톤은 `--accent` 기반 규칙을 사용한다.
- 버튼·입력·선택 요소에는 명확한 한국어 접근성 이름을 제공한다. `aria-label`은 안정적인 사용자 인터페이스 계약이다.
- 데스크톱뿐 아니라 좁은 모바일 화면에서 내용이 가로로 넘치지 않는지 확인한다. 긴 리듬 그리드만 의도적으로 자체 가로 스크롤을 사용한다.
- Lucide 아이콘을 우선 사용하며, 텍스트를 숨기는 목적 외에는 `font-size: 0`을 사용하지 않는다.

## 작업 방식

1. 변경 전에 관련 데이터 흐름을 읽는다.
2. 데이터·상태·오디오·UI를 한 규칙으로 바꾸고 중복 계산을 피한다.
3. `npx prettier --write`로 수정 파일을 포맷하고 `npm run build`로 검증한다. 동작 확인이 필요하면 `npm run dev`로 직접 본다.
4. 사용자에게 변경 범위와 검증 결과를 짧게 전달한다.

작업과 무관한 파일, 기존 사용자 변경, 참고 이미지를 정리하거나 삭제하지 않는다. 파괴적인 Git 명령은 사용하지 않는다.
