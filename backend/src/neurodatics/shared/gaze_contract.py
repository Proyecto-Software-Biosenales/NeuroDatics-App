"""Persisted clean-gaze columns: written once at ingestion, only read by analytics."""

# Raise when the cleaning changes: a project ingested with another version is
# flagged for re-upload instead of being cleaned again at query time.
GAZE_CLEAN_VERSION = 1
GAZE_CLEAN_VERSION_KEY = "gaze_clean_version"

# Percent of the stimulus (or of the screen when the scenario has no placement);
# NaN where the gaze was lost, off the stimulus or in a gap too long to bridge.
GAZE_X_CLEAN_COLUMN = "gaze_x_clean"
GAZE_Y_CLEAN_COLUMN = "gaze_y_clean"
