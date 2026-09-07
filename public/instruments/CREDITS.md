# 악기 샘플 출처

각 폴더의 `.mp3` 파일은 **FluidR3_GM** 사운드폰트(작성자 Frank Wen, MIT 라이선스)에서
아래 악기의 일부 음만 추출한 것입니다.

| 폴더            | FluidR3_GM 악기          | 사용 음색            |
| --------------- | ------------------------ | ------------------- |
| `upright-bass/`  | `acoustic_bass`          | 스튜디오 · 스트리트 |
| `nylon-guitar/`  | `acoustic_guitar_nylon`  | 스튜디오            |
| `finger-bass/`   | `electric_bass_finger`   | 라이브              |
| `jazz-guitar/`   | `electric_guitar_jazz`   | 라이브              |
| `steel-guitar/`  | `acoustic_guitar_steel`  | 스트리트            |
| `pick-bass/`     | `electric_bass_pick`     | 룸                  |
| `muted-guitar/`  | `electric_guitar_muted`  | 룸                  |
| `grand-piano/`   | `acoustic_grand_piano`   | 피아노              |

- 사운드폰트: FluidR3_GM — MIT License (© Frank Wen)
- 음별 mp3 변환본: https://github.com/gleitz/midi-js-soundfonts (MIT License)

베이스는 MIDI 33부터, 기타는 MIDI 48(나일론은 40)부터 3반음 간격으로만 담고,
재생 시 `playbackRate`로 사이 음을 보간한다. 음색 샘플이 로드되기 전에는
`src/audio.ts`의 Karplus–Strong 합성음(`pluck`)으로 대체된다.
