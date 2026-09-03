"""Build public, deterministic test inputs; no human recordings are used."""

import math
from pathlib import Path
import zipfile


def build(destination: Path) -> None:
    columns = [
        "Time", "Bandwidth / X", "Bandwidth / Y", "Bandwidth / Distance",
        "Bandwidth / LeftEyePupilDiameter", "Bandwidth / RightEyePupilDiameter",
        "GSR / GSR", *[f"EEG / {name}" for name in ("LE", "F4", "C4", "P4", "P3", "C3", "F3")],
        "Scenario 1",
    ]
    lines = []
    for participant in (1, 2):
        lines.extend([
            f"Grabación : SYN-0{participant} | Rec 1",
            "Nombre : Bandwidth / X", "Frecuencia : 100 Hz", "Unidad Tobii : %",
            "Nombre : Bandwidth / Y", "Frecuencia : 100 Hz", "Unidad Tobii : %",
            "Frecuencia del archivo : 100 Hz", ";".join(columns),
        ])
        for index in range(1600):
            t = index / 100
            local = t % 8
            phase = local % 2
            x = 20 + 3 * participant if phase < 0.8 else 72 - 2 * participant
            y = 30 if phase < 0.8 else 65
            if 0.8 <= phase < 1.0:
                x = 20 + 3 * participant + (phase - 0.8) * 230
                y = 30 + (phase - 0.8) * 175
            x += 0.06 * math.sin(2 * math.pi * 3 * t)
            y += 0.06 * math.cos(2 * math.pi * 2 * t)
            if 3.5 <= local < 3.65:
                x = y = -100
            pupil = 3 + 0.1 * participant + 0.2 * math.sin(2 * math.pi * 0.4 * t)
            values = [
                t, x, y, 60 + participant + math.sin(t), pupil,
                None if index % 83 == 0 else pupil + 0.1,
                1 + 0.2 * participant + 0.1 * t + 0.3 * math.sin(2 * math.pi * 0.3 * t),
                *[(1 + channel / 3 + participant / 10) * math.sin(2 * math.pi * (6 + channel) * t)
                  + 0.2 * math.cos(2 * math.pi * 17 * t) for channel in range(7)],
            ]
            lines.append(";".join("" if value is None else f"{value:.9f}" for value in values)
                         + ";" + ("stimulus-a" if index < 800 else "stimulus-b"))
    destination.parent.mkdir(parents=True, exist_ok=True)
    entries = {"experiment.csv": ("\n".join(lines) + "\n").encode("utf-8")}
    for scenario, color in (("stimulus-a", "#2563eb"), ("stimulus-b", "#16a34a")):
        entries[f"Images/{scenario}.svg"] = (
            f'<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">'
            f'<rect width="1280" height="720" fill="{color}"/></svg>\n'
        ).encode("ascii")
    with zipfile.ZipFile(destination, "w") as archive:
        for name, content in entries.items():
            entry = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.external_attr = 0o644 << 16
            archive.writestr(entry, content)


if __name__ == "__main__":
    build(Path(__file__).with_name("synthetic-experiment.zip"))
