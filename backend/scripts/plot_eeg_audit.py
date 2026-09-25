"""Render two audit diagnostics using a synthetic signal and aggregate evidence."""
import argparse
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("report", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    report = json.loads(args.report.read_text(encoding="utf8"))
    scaled = next(block for file in report["files"] for block in file["blocks"]
                  if block.get("eeg_acquisition", {}).get("source_units", {}).get("f3") == "kilo")
    plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 10})
    fig, axes = plt.subplots(1, 2, figsize=(12, 4.6), layout="constrained")
    t = np.arange(384) / 300
    x = np.sin(2 * np.pi * 10 * t)
    smooth = np.convolve(x, np.ones(60)/60, mode="same")
    keep = (t >= .2) & (t <= .8)
    axes[0].plot(t[keep], x[keep], label="Raw 10 Hz sine", color="#2563eb", lw=1.6)
    axes[0].plot(t[keep], smooth[keep], label="0.2 s moving mean", color="#dc2626", lw=2)
    axes[0].set(title="A. The previous default suppresses 10 Hz", xlabel="Time (s)", ylabel="Synthetic amplitude (uV)")
    axes[0].legend(loc="lower right", fontsize=9)
    labels = ["Export, multiplier ignored", "Export, multiplier applied", "Acquisition candidate"]
    values = [scaled["source_channel_ranges"]["f3"]["std"], scaled["channels"]["f3"]["std"],
              scaled["binary_anchor"]["channels"]["f3"]["std"]]
    axes[1].barh(labels, values, color=["#dc2626", "#2563eb", "#059669"])
    axes[1].set_xscale("log")
    axes[1].set_xlim(.1, 2200)
    axes[1].invert_yaxis()
    for i, value in enumerate(values):
        axes[1].text(value*1.12, i, f"{value:.3f}", va="center", fontsize=9)
    axes[1].set(title="B. SAIO block 5: F3 scale discrepancy", xlabel="F3 standard deviation (log scale; uV basis assumed)")
    for ax in axes:
        ax.spines[["top", "right"]].set_visible(False)
        ax.grid(axis="x", alpha=.15)
    fig.suptitle("EEG audit: independently reproducible processing errors", fontsize=14, fontweight="bold")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(args.output, dpi=180)
    plt.close(fig)


if __name__ == "__main__":
    main()
