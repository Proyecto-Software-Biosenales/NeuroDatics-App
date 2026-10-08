"""Anonymous EEG presentation evidence; leaves recordings unchanged.

Run from the repository root:
    .venv/Scripts/python.exe -X utf8 backend/scripts/presentation_eeg_comparison.py
"""
import hashlib
import json
from pathlib import Path
import runpy

audit = runpy.run_path("backend/scripts/audit_eeg_references.py")
CSV, EEG = audit["CSV"], audit["EEG"]
paths = sorted(Path("docs/RefererenceExperiments").rglob("*.csv"))
path = paths[7]
sha = hashlib.sha256(path.read_bytes()).hexdigest()
historical = json.loads(Path("docs/eeg-audit/reference-evidence.json").read_text())
assert sha == historical["files"][7]["sha256"]
text, _ = CSV._decode_bytes(path.read_bytes())
lines = text.splitlines()
spec = CSV._find_block_specs(lines)[4]
delimiter, _ = CSV._header_cells(lines[spec.header_index])
raw = CSV._build_dataframe_with_info(lines[spec.header_index:spec.block_end], delimiter).dataframe
channels, _, _ = CSV._parse_metadata(spec.metadata_lines, rename_vendor_fixations=True)
frame, _, _ = CSV._normalize_declared_units(raw, channels)
included = EEG.compute_psd(frame, use_db=False)
excluded = EEG.compute_psd(frame, use_db=False, exclude_artifact_windows=True)
unscaled = EEG.compute_psd(raw, use_db=False)
meta = included["metadata"]
out = {
    "recording": "csv-08", "block": 5, "sha256": sha,
    "scope": "entire block, all available EEG channels, original scenario boundaries preserved",
    "processing": "default as-exported reference, no bandpass or notch; explicit PSD window exclusion only in excluded result",
    "f3": {
        "windows_total": meta["windows_total"]["f3"],
        "windows_flagged": meta["windows_flagged"]["f3"],
        "windows_kept_excluded": excluded["metadata"]["valid_windows"]["f3"],
        "nperseg": meta["nperseg"],
        "frequency_resolution_hz": meta["frequency_resolution_hz"],
        "total_power_included_assumed_uV2": included["total_power"]["f3"],
        "total_power_excluded_assumed_uV2": excluded["total_power"]["f3"],
        "included_to_excluded_power_ratio": included["total_power"]["f3"] / excluded["total_power"]["f3"],
        "total_power_before_scale_correction": unscaled["total_power"]["f3"],
        "scale_correction_power_ratio": included["total_power"]["f3"] / unscaled["total_power"]["f3"],
        "source": audit["channel_summary"](raw["f3"]),
        "normalized": audit["channel_summary"](frame["f3"]),
        "band_power_included_assumed_uV2": included["band_power"]["f3"],
        "band_power_excluded_assumed_uV2": excluded["band_power"]["f3"],
    },
    "limits": ["Unit physical basis assumed where undeclared", "Heuristic artifact flags are not ground truth", "Excluded windows change time coverage", "Scale comparison uses same current Welch code on raw versus normalized values, not a reconstructed historical application"],
}
destination = Path("docs/presentation/propuesta-final/eeg-comparacion.json")
destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_text(json.dumps(out, indent=2, allow_nan=False) + "\n", encoding="utf-8")
print(json.dumps({"f3": out["f3"]}, indent=2, allow_nan=False))
