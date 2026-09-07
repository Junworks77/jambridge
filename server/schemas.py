"""Validate persisted user edits; audio files never enter JSON settings."""

from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator

Seconds = Annotated[float, Field(ge=0, le=600)]


class Value(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)


class Settings(Value):
    tuning: list[Annotated[int, Field(ge=28, le=76)]] = Field(
        min_length=6, max_length=6
    )
    capo: int = Field(ge=0, le=12)
    minFret: int = Field(ge=0, le=24)
    maxFret: int = Field(ge=0, le=24)

    @model_validator(mode="after")
    def order(self):
        if max(self.minFret, self.capo) > self.maxFret:
            raise ValueError("카포와 최소 프렛은 최대 프렛 이하여야 합니다.")
        return self


class Note(Value):
    id: str = Field(min_length=1, max_length=100)
    start: Seconds
    end: Seconds
    midi: int = Field(ge=0, le=127)
    confidence: float = Field(ge=0, le=1)
    attack: float | None = Field(default=None, ge=0, le=1)
    curve: list[float] = Field(default_factory=list, max_length=50000)
    technique: Literal["none", "bend", "slide", "hammer", "pull", "vibrato"]
    bend: float = Field(ge=0, le=4)
    source: Literal["estimated", "confirmed"]
    part: Literal["vocals", "drums", "bass", "guitar", "other"] = "guitar"
    string: int | None = Field(ge=0, le=5)
    fret: int | None = Field(ge=0, le=24)
    locked: bool
    link: str | None = Field(default=None, max_length=100)

    @model_validator(mode="after")
    def order(self):
        if self.end <= self.start or (self.string is None) != (self.fret is None):
            raise ValueError("음의 시간과 줄·프렛 쌍을 확인해 주세요.")
        return self


class Key(Value):
    root: int = Field(ge=0, le=11)
    mode: Literal["major", "minor"]
    score: float | None = Field(default=None, ge=-1, le=1)


class Section(Value):
    id: str = Field(max_length=100)
    name: str = Field(max_length=80)
    start: Seconds
    end: Seconds

    @model_validator(mode="after")
    def order(self):
        if self.end <= self.start:
            raise ValueError("구간 끝은 시작보다 뒤여야 합니다.")
        return self


Meter = Literal["3/4", "4/4", "5/8", "7/8", "12/8"]


class MeterCandidate(Value):
    meter: Meter
    score: float = Field(ge=-1, le=1)


class Analysis(Value):
    bpm: float | None = Field(ge=1, le=600)
    beats: list[Seconds] = Field(max_length=10000)
    key: Key | None
    keyCandidates: list[Key] = Field(max_length=24)
    meter: Meter | None
    meterCandidates: list[MeterCandidate] = Field(max_length=5)
    firstDownbeat: Seconds
    sections: list[Section] = Field(max_length=600)
    reviewRequired: bool
    timingEdited: bool


class Channel(Value):
    volume: float = Field(ge=0, le=100)
    mute: bool
    solo: bool


class Edits(Value):
    version: Literal[1] = 1
    name: str = Field(min_length=1, max_length=200)
    analysis: Analysis | None
    notes: list[Note] = Field(max_length=50000)
    settings: Settings
    mix: dict[Literal["vocals", "drums", "bass", "guitar", "other"], Channel] = Field(
        default_factory=dict
    )
    position: Seconds = 0

    @model_validator(mode="after")
    def consistency(self):
        if len({n.id for n in self.notes}) != len(self.notes):
            raise ValueError("음 ID가 중복되었습니다.")
        for n in self.notes:
            if n.string is not None and (
                self.settings.tuning[n.string] + n.fret != n.midi
                or not max(self.settings.capo, self.settings.minFret)
                <= n.fret
                <= self.settings.maxFret
            ):
                raise ValueError("음높이와 튜닝·프렛이 일치하지 않습니다.")
        return self
