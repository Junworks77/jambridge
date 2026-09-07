# 분석 모델과 라이브러리

- **Demucs 4.0.1 / htdemucs_6s**: https://github.com/facebookresearch/demucs — MIT. 최초 분석 시 공식 pretrained 모델을 다운로드합니다. 6개 출력 중 piano와 other를 합칩니다. 공식 문서가 기타·피아노 모델을 실험적이라고 명시하며, 피아노에는 누출/아티팩트가 있을 수 있습니다. 원 저장소는 보관 상태이므로 버전을 고정합니다.
- **Spotify Basic Pitch 0.4.0 / ICASSP 2022 nmp.onnx**: https://github.com/spotify/basic-pitch — Apache-2.0. 패키지에 포함된 ONNX 모델을 명시적으로 사용합니다. 다성음과 피치 변화를 추출하며 주법/줄/프렛은 별도 추정입니다.
- **librosa 0.11.0**: https://github.com/librosa/librosa — ISC. onset/beat/chroma/MFCC 분석에 사용합니다. Key 프로파일 상관, 박자 강세 주기 비교, 구간 경계·반복 표시는 앱의 휴리스틱이며 학습된 주법·박자 분류기가 아닙니다.
- **FFmpeg**: https://ffmpeg.org — 사용자가 설치한 바이너리를 호출하며 재배포하지 않습니다. 해당 빌드의 라이선스는 배포처에서 확인하세요.

자동 결과는 정답 악보나 원래 운지의 복원이 아닙니다. 주법은 피치 곡선·어택과 추천 운지에서 후보를 만들고 사용자가 확정합니다. 테스트 음원은 외부 음악이 아닌 코드로 직접 생성한 신호입니다.
