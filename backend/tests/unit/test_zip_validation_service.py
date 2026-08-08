"""Structure rules, clarification flow and zip-bomb guards for ZIP ingestion."""

import zipfile

import pytest

from neurodatics.modules.projects.application.services.zip_extraction_service import (
    ZipExtractionService,
)
from neurodatics.modules.projects.application.services.zip_validation_service import (
    UploadSelection,
    ZipValidationService,
)


def build_zip(tmp_path, entries, name="experiment.zip", compression=zipfile.ZIP_DEFLATED):
    path = tmp_path / name
    with zipfile.ZipFile(path, "w", compression) as archive:
        for entry_name, data in entries.items():
            archive.writestr(entry_name, data)
    return path


def analyze(path, selection=None):
    return ZipValidationService.validate_and_analyze(
        filename="experiment.zip",
        mime_type="application/zip",
        zip_path=str(path),
        selection=selection,
    )


ALLOW_NO_MEDIA = UploadSelection(allow_missing_images=True, allow_missing_videos=True)


# --------------------------------------------------------------- happy path


def test_single_csv_with_one_images_and_videos_folder_needs_no_clarification(tmp_path):
    path = build_zip(
        tmp_path,
        {
            "data.csv": b"time;gsr\n1;2\n",
            "Images/stimulus.png": b"png-bytes",
            "Videos/clip.mp4": b"mp4-bytes",
        },
    )

    entries, counts, selection, acquisition, excluded = analyze(path)

    assert counts == {"images": 1, "videos": 1, "csv": 1, "other": 0}
    assert selection.csv_entry_path == "data.csv"
    assert selection.images_folder == "Images"
    assert selection.videos_folder == "Videos"
    assert acquisition.present is False
    assert excluded == []
    assert len(entries) == 3


# ------------------------------------------------- only one data source (.csv)


def test_multiple_csv_files_ask_which_one_to_process(tmp_path):
    path = build_zip(
        tmp_path,
        {
            "a.csv": b"time;x\n",
            "nested/b.csv": b"time;y\n",
            "Images/s.png": b"png",
            "Videos/v.mp4": b"mp4",
        },
    )

    with pytest.raises(ZipValidationService.ClarificationRequired) as excinfo:
        analyze(path)

    question = next(q for q in excinfo.value.questions if q.code == "multiple_csv")
    assert question.kind == "choice"
    assert question.field == "selected_csv_path"
    assert sorted(question.options) == ["a.csv", "nested/b.csv"]


def test_chosen_csv_is_processed_and_the_others_are_excluded(tmp_path):
    path = build_zip(
        tmp_path,
        {
            "a.csv": b"time;x\n",
            "nested/b.csv": b"time;y\n",
            "Images/s.png": b"png",
            "Videos/v.mp4": b"mp4",
        },
    )

    entries, counts, selection, _, excluded = analyze(
        path, UploadSelection(csv_entry_path="nested/b.csv")
    )

    assert counts["csv"] == 1
    assert selection.csv_entry_path == "nested/b.csv"
    assert excluded == ["a.csv"]
    assert all(entry.source_entry_path != "a.csv" for entry in entries)


def test_csv_choice_outside_the_archive_is_rejected(tmp_path):
    path = build_zip(
        tmp_path, {"a.csv": b"time;x\n", "b.csv": b"time;y\n", "Images/s.png": b"png"}
    )

    with pytest.raises(ZipValidationService.ValidationError, match="no existe"):
        analyze(path, UploadSelection(csv_entry_path="../../etc/passwd", allow_missing_videos=True))


def test_archive_without_any_csv_is_rejected_outright(tmp_path):
    path = build_zip(tmp_path, {"Images/s.png": b"png"})

    with pytest.raises(ZipValidationService.ValidationError, match=r"\.csv"):
        analyze(path)


# ------------------------------------------------ Images / Videos disambiguation


def test_missing_images_and_videos_folders_ask_for_confirmation(tmp_path):
    path = build_zip(tmp_path, {"data.csv": b"time;x\n"})

    with pytest.raises(ZipValidationService.ClarificationRequired) as excinfo:
        analyze(path)

    questions = {q.code: q for q in excinfo.value.questions}
    assert set(questions) == {"no_images_folder", "no_videos_folder"}
    assert questions["no_images_folder"].kind == "confirm"
    assert questions["no_images_folder"].field == "allow_missing_images"
    assert questions["no_videos_folder"].field == "allow_missing_videos"


def test_csv_only_archive_is_accepted_once_the_user_confirms(tmp_path):
    path = build_zip(tmp_path, {"data.csv": b"time;x\n"})

    entries, counts, _, _, _ = analyze(path, ALLOW_NO_MEDIA)

    assert counts == {"images": 0, "videos": 0, "csv": 1, "other": 0}
    assert len(entries) == 1


def test_two_images_folders_ask_which_one_and_ingest_only_that_one(tmp_path):
    path = build_zip(
        tmp_path,
        {
            "data.csv": b"time;x\n",
            "setA/Images/a.png": b"a",
            "setB/Images/b.png": b"b",
            "Videos/v.mp4": b"mp4",
        },
    )

    with pytest.raises(ZipValidationService.ClarificationRequired) as excinfo:
        analyze(path)
    question = next(q for q in excinfo.value.questions if q.code == "multiple_images_folders")
    assert sorted(question.options) == ["setA/Images", "setB/Images"]

    _, counts, selection, _, excluded = analyze(
        path, UploadSelection(images_folder="setB/Images")
    )
    assert counts["images"] == 1
    assert selection.images_folder == "setB/Images"
    assert excluded == ["setA/Images/a.png"]


def test_two_videos_folders_ask_which_one(tmp_path):
    path = build_zip(
        tmp_path,
        {
            "data.csv": b"time;x\n",
            "Images/a.png": b"a",
            "setA/Videos/a.mp4": b"a",
            "setB/Videos/b.mp4": b"b",
        },
    )

    with pytest.raises(ZipValidationService.ClarificationRequired) as excinfo:
        analyze(path)

    question = next(q for q in excinfo.value.questions if q.code == "multiple_videos_folders")
    assert question.field == "selected_videos_folder"
    assert sorted(question.options) == ["setA/Videos", "setB/Videos"]


def test_media_outside_a_scenario_folder_is_demoted_not_excluded(tmp_path):
    path = build_zip(
        tmp_path,
        {"data.csv": b"time;x\n", "loose.png": b"png", "Images/real.png": b"png"},
    )

    entries, counts, _, _, excluded = analyze(path, UploadSelection(allow_missing_videos=True))

    kinds = {entry.source_entry_path: entry.kind for entry in entries}
    assert kinds["loose.png"] == "other_asset"
    assert kinds["Images/real.png"] == "scenario_image"
    assert counts["images"] == 1 and counts["other"] == 1
    assert excluded == []


# --------------------------------------------------------- Acquisition folder


def test_acquisition_folder_is_parsed_for_defaults_but_never_ingested(tmp_path):
    path = build_zip(
        tmp_path,
        {
            "data.csv": b"time;x\n",
            "Images/a.png": b"png",
            "Videos/v.mp4": b"mp4",
            "Acquisition/Sujet_1001014126_Scenario_Scenario 1_Rec1/notes.txt": b"n",
            "Acquisition/Sujet_1001014126_Scenario_Scenario 1_Rec1/meta.json": b"{}",
            "Acquisition/Sujet_1000557085_Scenario_Yom Yom_Rec2/notes.txt": b"n",
        },
    )

    entries, counts, selection, acquisition, excluded = analyze(path)

    assert acquisition.present is True
    assert selection.acquisition_folder == "Acquisition"
    assert acquisition.default_participant_codes() == ["1001014126", "1000557085"]
    assert acquisition.default_scenario_names() == ["Scenario 1", "Yom Yom"]

    first = acquisition.recordings[0]
    assert first.recording_index == 1
    assert sorted(first.documents) == ["meta.json", "notes.txt"]

    # "the app itself will not store any information of that folder"
    assert all(not e.source_entry_path.startswith("Acquisition/") for e in entries)
    assert all(e.startswith("Acquisition/") for e in excluded)
    assert counts == {"images": 1, "videos": 1, "csv": 1, "other": 0}


def test_acquisition_subtree_never_competes_with_the_real_scenario_folders(tmp_path):
    path = build_zip(
        tmp_path,
        {
            "data.csv": b"time;x\n",
            "Images/real.png": b"png",
            "Videos/real.mp4": b"mp4",
            "Acquisition/Images/decoy.png": b"decoy",
            "Acquisition/Videos/decoy.mp4": b"decoy",
            "Acquisition/reference.csv": b"time;ignored\n",
        },
    )

    # No clarification: the Acquisition copies must not look like a second
    # Images/Videos folder or a second data source.
    _, counts, selection, _, _ = analyze(path)

    assert selection.images_folder == "Images"
    assert selection.videos_folder == "Videos"
    assert selection.csv_entry_path == "data.csv"
    assert counts == {"images": 1, "videos": 1, "csv": 1, "other": 0}


def test_non_recording_folders_under_acquisition_are_not_counted_as_recordings(tmp_path):
    path = build_zip(
        tmp_path,
        {
            "data.csv": b"time;x\n",
            "Acquisition/Sujet_1001014126_Scenario_Scenario 1_Rec1/notes.txt": b"n",
            "Acquisition/random_folder/file.txt": b"x",
        },
    )

    _, _, _, acquisition, _ = analyze(path, ALLOW_NO_MEDIA)

    assert [rec.folder_name for rec in acquisition.recordings] == [
        "Sujet_1001014126_Scenario_Scenario 1_Rec1"
    ]


def test_two_acquisition_folders_ask_which_one(tmp_path):
    path = build_zip(
        tmp_path,
        {
            "data.csv": b"time;x\n",
            "runA/Acquisition/Sujet_1_Scenario_S_Rec1/n.txt": b"n",
            "runB/Acquisition/Sujet_2_Scenario_S_Rec1/n.txt": b"n",
        },
    )

    with pytest.raises(ZipValidationService.ClarificationRequired) as excinfo:
        analyze(path, ALLOW_NO_MEDIA)

    question = next(
        q for q in excinfo.value.questions if q.code == "multiple_acquisition_folders"
    )
    assert sorted(question.options) == ["runA/Acquisition", "runB/Acquisition"]


# ------------------------------------------------------------- zip-bomb guards


def test_entry_expanding_beyond_the_per_file_cap_is_rejected(tmp_path):
    path = tmp_path / "bomb.zip"
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        archive.writestr("data.csv", b"time;x\n")
        archive.writestr("Images/huge.png", b"\0" * (900 * 1024 * 1024))

    with pytest.raises(ZipValidationService.ValidationError, match="maximo por archivo"):
        analyze(path)


def test_entry_count_above_the_cap_is_rejected(tmp_path, monkeypatch):
    from neurodatics.config.settings import settings

    monkeypatch.setattr(settings, "project_zip_max_entries", 10, raising=False)

    path = tmp_path / "many.zip"
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("data.csv", b"time;x\n")
        for index in range(20):
            archive.writestr(f"Images/f{index}.png", b"x")

    with pytest.raises(ZipValidationService.ValidationError, match="demasiadas entradas"):
        analyze(path)


def test_total_uncompressed_size_above_the_cap_is_rejected(tmp_path, monkeypatch):
    from neurodatics.config.settings import settings

    monkeypatch.setattr(settings, "project_zip_max_uncompressed_mb", 1, raising=False)
    monkeypatch.setattr(settings, "project_zip_max_entry_uncompressed_mb", 1, raising=False)
    monkeypatch.setattr(settings, "project_zip_max_compression_ratio", 1_000_000.0, raising=False)

    path = tmp_path / "total.zip"
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        archive.writestr("data.csv", b"time;x\n")
        for index in range(4):
            archive.writestr(f"Images/f{index}.png", b"\0" * (512 * 1024))

    with pytest.raises(ZipValidationService.ValidationError, match="descomprimido"):
        analyze(path)


def test_suspicious_compression_ratio_is_rejected(tmp_path, monkeypatch):
    from neurodatics.config.settings import settings

    monkeypatch.setattr(settings, "project_zip_max_compression_ratio", 5.0, raising=False)

    path = tmp_path / "ratio.zip"
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        archive.writestr("data.csv", b"time;x\n")
        archive.writestr("Images/a.png", b"\0" * (2 * 1024 * 1024))

    with pytest.raises(ZipValidationService.ValidationError, match="tasa de compresion"):
        analyze(path)


def test_oversized_archive_is_rejected_by_the_compressed_cap(tmp_path, monkeypatch):
    from neurodatics.config.settings import settings

    monkeypatch.setattr(settings, "project_zip_max_size_mb", 0, raising=False)
    path = build_zip(tmp_path, {"data.csv": b"time;x\n"})

    with pytest.raises(ZipValidationService.ValidationError, match="maximo permitido"):
        analyze(path)


def test_non_zip_filename_and_mime_type_are_rejected(tmp_path):
    path = build_zip(tmp_path, {"data.csv": b"time;x\n"})

    with pytest.raises(ZipValidationService.ValidationError, match=r"\.zip"):
        ZipValidationService.validate_and_analyze(
            filename="experiment.tar", mime_type="application/zip", zip_path=str(path)
        )

    with pytest.raises(ZipValidationService.ValidationError, match="MIME"):
        ZipValidationService.validate_and_analyze(
            filename="experiment.zip", mime_type="text/html", zip_path=str(path)
        )


# ------------------------------------------------------------------ extraction


def test_extraction_writes_every_manifest_entry_and_nothing_else(tmp_path):
    path = build_zip(
        tmp_path,
        {
            "data.csv": b"time;x\n",
            "Images/a.png": b"png-bytes",
            "Acquisition/Sujet_1_Scenario_S_Rec1/n.txt": b"reference",
        },
    )
    entries, _, _, _, _ = analyze(path, UploadSelection(allow_missing_videos=True))

    with ZipExtractionService.extract_to_temp(str(path), entries) as extracted:
        written = set(extracted.files_by_entry_path)
        assert written == {"data.csv", "Images/a.png"}
        from pathlib import Path

        assert Path(extracted.files_by_entry_path["Images/a.png"]).read_bytes() == b"png-bytes"


def test_extraction_rejects_a_member_whose_bytes_exceed_the_declared_size(tmp_path):
    """A hostile central directory can under-declare `file_size`."""
    # Stored, not deflated: a 1:1 ratio keeps the zip-bomb guard out of the way
    # so this exercises the extraction budget specifically.
    path = build_zip(
        tmp_path,
        {"data.csv": b"time;x\n", "Images/a.png": b"A" * 4096},
        compression=zipfile.ZIP_STORED,
    )
    entries, _, _, _, _ = analyze(path, UploadSelection(allow_missing_videos=True))

    for entry in entries:
        if entry.source_entry_path == "Images/a.png":
            entry.size_bytes = 1  # pretend the header claimed a single byte

    # The budget adds a chunk of slack over the declared size, so shrink it too.
    original_chunk = ZipExtractionService.COPY_CHUNK_SIZE
    ZipExtractionService.COPY_CHUNK_SIZE = 16
    try:
        with pytest.raises(ZipExtractionService.ExtractionError, match="declarado"):
            with ZipExtractionService.extract_to_temp(str(path), entries):
                pass
    finally:
        ZipExtractionService.COPY_CHUNK_SIZE = original_chunk


def test_extraction_rejects_a_corrupt_member(tmp_path):
    source = tmp_path / "src.zip"
    with zipfile.ZipFile(source, "w", zipfile.ZIP_STORED) as archive:
        archive.writestr("data.csv", b"time;x\n" * 200)
    with zipfile.ZipFile(source) as archive:
        info = archive.getinfo("data.csv")
        data_offset = info.header_offset + 30 + len(info.filename) + len(info.extra or b"")

    raw = bytearray(source.read_bytes())
    raw[data_offset + 20 : data_offset + 30] = b"\xff" * 10
    corrupt = tmp_path / "corrupt.zip"
    corrupt.write_bytes(bytes(raw))

    entries, _, _, _, _ = analyze(corrupt, ALLOW_NO_MEDIA)

    with pytest.raises(ZipExtractionService.ExtractionError):
        with ZipExtractionService.extract_to_temp(str(corrupt), entries):
            pass


@pytest.mark.parametrize(
    "unsafe_path",
    ["../escape.csv", "/etc/passwd", "C:/Windows/system.ini", "a/../../b.csv"],
)
def test_unsafe_relative_paths_are_detected(unsafe_path):
    assert ZipExtractionService._is_unsafe_relative_path(unsafe_path) is True


def test_safe_relative_paths_are_allowed():
    for safe in ["data.csv", "Images/a.png", "a/b/c.mp4"]:
        assert ZipExtractionService._is_unsafe_relative_path(safe) is False
