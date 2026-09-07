import CollapsiblePanel from "./CollapsiblePanel";
import { useState } from "react";
import { ArrowRight, Check, Music2 } from "lucide-react";
import {
  RHYTHM_GENRES,
  RHYTHM_PRESETS,
  type RhythmGenre,
  type RhythmPreset,
} from "./rhythm";
import "./rhythm.css";

export default function RhythmPresets({
  selectedId,
  onApply,
}: {
  selectedId: string | null;
  onApply: (preset: RhythmPreset) => void;
}) {
  const [genre, setGenre] = useState<RhythmGenre>("전체");
  return (
    <CollapsiblePanel
      className="panel rhythm-preset-library"
      title="장르별 추천 리듬"
      header={
        <>
          <h2>
            <Music2 size={17} /> 장르별 추천 리듬{" "}
            <span className="outline-tag">{RHYTHM_PRESETS.length} PRESETS</span>
          </h2>
          <span className="muted-label">박자 · 템포 · 패턴을 한 번에</span>
        </>
      }
    >
      <div className="rhythm-genres" aria-label="리듬 장르">
        {RHYTHM_GENRES.map((g) => (
          <button
            key={g}
            aria-pressed={genre === g}
            className={genre === g ? "active" : ""}
            onClick={() => setGenre(g)}
          >
            {g}
          </button>
        ))}
      </div>
      <div className="rhythm-preset-list" key={genre}>
        {RHYTHM_PRESETS.filter(
          (p) => genre === "전체" || p.genre === genre,
        ).map((p) => (
          <button
            key={p.id}
            className={`rhythm-preset-card ${p.id === selectedId ? "selected" : ""}`}
            aria-label={`${p.name} 프리셋 적용`}
            onClick={() => onApply(p)}
          >
            <div>
              <span className="meter-badge">{p.meter}</span>
              <span>
                {p.genre} · ♩ {p.bpm}
              </span>
              {p.id === selectedId ? (
                <Check size={14} />
              ) : (
                <ArrowRight size={14} />
              )}
            </div>
            <h3>{p.name}</h3>
            <p>{p.description}</p>
            <span className="preset-grouping">
              {p.grouping.join(" + ")}
              {p.swing ? " · 16분 스윙" : ""}
            </span>
          </button>
        ))}
      </div>
      <p className="rhythm-library-note">
        장르의 느낌을 익히는 연습용 패턴입니다. 선택 후 스트로크와 강세 묶음을
        자유롭게 바꿔보세요.
      </p>
    </CollapsiblePanel>
  );
}
