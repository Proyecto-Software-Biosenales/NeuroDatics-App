"""Shareable per-device reports: analytics -> document model -> Typst PDF.

Each device (Eye Tracking, GSR, EEG) has one builder that turns participant
frames into a document of blocks plus the chart and image files it references.
``infrastructure.pdf_adapter`` lays that document out with a Typst template.
"""
