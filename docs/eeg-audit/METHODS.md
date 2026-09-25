# EEG v2 methods and reproducibility

## Scope and provenance

Inputs are exported channel voltages at recorded times. Scalp channels are F3,
F4, C3, C4, P3, P4. LE is retained for inspection/PSD but excluded from scalp
maps and pooled EEG correlation; TRG is a marker. The app does not silently
re-reference, interpolate, filter, remove components or classify artifacts.

Explicit voltage units are converted to uV. Blank units retain the historical
uV assumption with a warning. The vendor `kilo` display scale is multiplied by
1,000, supported by the local acquisition comparison, while retaining the same
physical-unit caveat. Unknown units are preserved in storage but excluded from
quantitative EEG arrays. Metadata accompanies user/scenario parquet and API
outputs. Old parquet without that metadata requires source verification.

## Time and valid runs

Let t_i be seconds and x_c,i a channel value. The working rate is

    fs = 1 / median(t[i+1] - t[i]), using finite positive intervals.

It is the **export-grid estimate**, not proof of the ADC sampling rate. No rate
is invented if the clock cannot be estimated. Duplicate/reversed timestamps
make chronology ambiguous and suppress spectral/topography results.

A run ends at a nonfinite timestamp, a scenario transition, or an interval
deviating by more than 5% from the median. That tolerance is an engineering
policy for timestamp precision, not a universal EEG standard. The reference
shared-grid exports are uniform well within it. Subthreshold jitter is treated
as an approximately uniform grid and disclosed by the policy metadata.
Per-channel missing voltages split PSD/smoothing runs and invalidate affected
spectrogram/topography windows. Values on opposite sides are never concatenated
or interpolated. This follows the principle of explicitly excluding invalid
spans rather than fabricating observations. [MNE bad-span handling](https://mne.tools/stable/auto_tutorials/preprocessing/20_rejecting_bad_data.html).

## Temporal display and statistics

Raw values are the initial display. Optional smoothing is a centered rectangular
moving mean within a valid run, with truncated edge support. For L samples, its
amplitude response is |sin(pi f L/fs)/(L sin(pi f/fs))|. A 0.2 s window can
strongly attenuate EEG rhythms; it is a visual trend aid only.

Count, mean, sample SD (N−1 denominator), median, minimum, maximum and RMS are
computed before plot reduction from finite samples. RMS = sqrt(mean(x²)); it
includes offsets and is not automatically neural oscillatory power. Each mode
has separate statistics. A sorted low-percentile subset is not a prestimulus
baseline, so the old Base/Pico % columns were removed. A future baseline needs
an explicit experimental time interval. [MNE baseline conventions](https://mne.tools/stable/generated/mne.baseline.rescale.html).

The plot cap selects samples, not a new signal for analysis. Gap-crossing display
connections are broken. This preview can alias or miss peaks; use a narrower
time window for morphology. PSD and statistics always use the source samples.

## Welch PSD and band integration

For each selected channel, find contiguous finite runs. The common segment
length is the smaller of 1,024 and the shortest channel's longest eligible run;
at least eight samples are required. That minimum is computational, not proof
of useful low-frequency resolution. Resolution is fs/L and is reported.

Each segment removes its own mean, uses a **periodic Hann** window and 50%
overlap, and returns a one-sided density. Run estimates are combined weighted
by their number of Welch windows, not equally by run. No window spans a gap.
For real x, each non-DC/non-Nyquist bin is doubled, with normalization by
fs times the sum of squared window weights. Units are uV²/Hz when the input
calibration is valid. [SciPy Welch definition](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.welch.html).

Display level = 10 log10(max(P, 10^-12) / (1 uV²/Hz)). The floor prevents an
infinite display for zero power; it is not added to physical power estimates.
Linear arrays retain floating-point precision. The complete bin sum times
frequency spacing yields the window-energy-normalized mean square (Parseval).

Bands are declared conventions: delta 0.5–4, theta 4–8, alpha 8–13, beta 13–30,
gamma 30–45 Hz. Integrals use piecewise-linear PSD interpolation at exact edges
and trapezoidal integration. A band beyond Nyquist or narrower than one bin is
unavailable (null), never silently truncated. These are absolute descriptive
band powers, not diagnoses or baseline-relative measures. Different window
lengths/valid time coverage limit comparisons; retain window counts/resolution.

## Spectrogram

Default windows: 1.5 s periodic Hann, 75% overlap, segment-mean removal, density
scaling, no normalization and no Gaussian smoothing. A single complete window
is valid. The display frequency limit of 25 Hz is a viewing choice; it says
nothing about whether higher frequencies are neural or muscular.

Each channel is evaluated on a shared set of actual window centers. Its invalid
windows remain null without deleting valid data from another channel. The UI
maps pixel position to actual time and leaves unavailable spans blank. Color
percentiles control only the color scale; they do not modify returned values.
The calculation follows SciPy's explicitly parameterized windowed density.
[SciPy spectrogram reference](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.spectrogram.html).

Optional `freq_demean` is retained for API compatibility but actually subtracts
the temporal **median** for each frequency/channel. In dB it is a log-ratio to
that median level, not an experimental baseline. `freq_zscore` standardizes each
frequency using its temporal mean and population SD. Optional Gaussian smoothing
uses frequency/time-bin units and is restricted to uninterrupted valid runs.
These are display transforms. Averaging their pixels is not integrated power.

## Sensor power map

Default: 2 s windows, 50% overlap. For each complete channel/window,

    q[c,k] = sum(w[n]^2 * (x[c,k,n] - mean(x[c,k,:]))^2) / sum(w[n]^2)

where w is a symmetric Hann; `remove_dc=false` omits subtraction. At least three
valid scalp channels are required for a frame. Missing channels are not filled
temporally. Layout positions use a fixed scale independent of selected channels.
The browser's inverse-distance interpolation is a schematic sensor visualization.
It is not an inverse solution or cortical source estimate; those require a head
model and electrode geometry. [MNE EEG source-localization example](https://mne.tools/stable/auto_tutorials/inverse/70_eeg_mri_coords.html).

## Correlation and quality flags

EEG correlation uses per-channel mean-square deviations inside each 250 ms bin,
then averages a fixed channel set in linear units and converts to dB. A bin needs
at least max(8, ceil(0.8 fs × 0.25)) samples, all finite for every included
channel, with no clock/condition break. Missing channels invalidate the bin;
they never change the montage used by the average. This rectangular-bin feature
differs from Hann topography and is explicitly a descriptive zero-lag feature.

Quality metadata counts missing values, repeated adjacent values, constants,
clock breaks and candidate jumps. A jump is flagged above
max(100 assumed uV, 20 × 1.4826 × MAD(first differences)). This deliberately
conservative heuristic is **not** a validated artifact classifier. It removes
nothing. Investigate flagged events and choose exclusion/filter settings based
on acquisition evidence. Downsampling without an appropriate low-pass filter
can alias; later filtering cannot undo that loss. [MNE resampling guidance](https://mne.tools/stable/auto_tutorials/preprocessing/30_filtering_resampling.html).

## Reproduce

From the repository root in PowerShell:

```powershell
.venv/Scripts/python.exe -X utf8 backend/scripts/audit_eeg_references.py `
  docs/RefererenceExperiments --report output/eeg-reference-audit.json
# Use a fresh, workspace-local pytest temporary directory in restricted sessions.
$env:PYTEST_ADDOPTS='--basetemp=../output/pytest-eeg-fresh'
./verify.ps1
cd frontend
npx playwright test tests/e2e/eeg-dashboard.spec.ts --workers=1
```

The audit JSON contains file SHA-256, anonymous block indices, source/storage
scale evidence, channel summaries, native-format diagnostics and per-scenario
service availability. It never contains participant codes or sample arrays.
