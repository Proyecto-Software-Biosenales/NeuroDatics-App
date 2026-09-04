"use client"

import { cn } from "@/lib/utils"
import { formatChannel, formatNumber, type ChannelStats } from "../../eegPresentation"
import { CHANNEL_COLORS, type PsdStats, type SpectrogramStats } from "./eegViewShared"

export function EegStatsTable({ rows }: { rows: ChannelStats[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/60">
            {["Canal", "N", "Base", "Media", "Desv.", "Mediana", "Min", "Max", "Pico %"].map((header, index) => (
              <th
                key={header}
                className={cn(
                  "px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                  index === 0 ? "text-left" : "text-right"
                )}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.channel} className="border-b border-border/50 last:border-b-0 hover:bg-muted/30">
              <td className="px-4 py-4">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: CHANNEL_COLORS[row.channel] ?? "#4B5563" }}
                  />
                  <span className="font-semibold text-foreground">{formatChannel(row.channel)}</span>
                </div>
              </td>
              <td className="px-4 py-4 text-right text-muted-foreground">{row.count}</td>
              <td className="px-4 py-4 text-right text-muted-foreground">{formatNumber(row.baseline, 4, " uV")}</td>
              <td className="px-4 py-4 text-right font-semibold text-foreground">{formatNumber(row.mean, 4, " uV")}</td>
              <td className="px-4 py-4 text-right text-foreground/80">{formatNumber(row.std, 4, " uV")}</td>
              <td className="px-4 py-4 text-right text-foreground/80">{formatNumber(row.median, 4, " uV")}</td>
              <td className="px-4 py-4 text-right font-medium text-emerald-500 dark:text-emerald-400">{formatNumber(row.min, 4, " uV")}</td>
              <td className="px-4 py-4 text-right font-medium text-rose-500 dark:text-rose-400">{formatNumber(row.max, 4, " uV")}</td>
              <td className="px-4 py-4 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                {row.peakPercent != null ? `${row.peakPercent >= 0 ? "+" : ""}${row.peakPercent.toFixed(1)}%` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function PsdStatsTable({ rows, unit }: { rows: PsdStats[]; unit: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/60">
            {["Canal", "Bins", "Freq. pico", "Pot. pico", "Pot. media", "Desv.", "Mediana", "Min", "Max"].map((header, index) => (
              <th
                key={header}
                className={cn(
                  "px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                  index === 0 ? "text-left" : "text-right"
                )}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.channel} className="border-b border-border/50 last:border-b-0 hover:bg-muted/30">
              <td className="px-4 py-4">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: CHANNEL_COLORS[row.channel] ?? "#4B5563" }}
                  />
                  <span className="font-semibold text-foreground">{formatChannel(row.channel)}</span>
                </div>
              </td>
              <td className="px-4 py-4 text-right text-muted-foreground">{row.count}</td>
              <td className="px-4 py-4 text-right font-semibold text-foreground">{formatNumber(row.peakFrequency, 2, " Hz")}</td>
              <td className="px-4 py-4 text-right font-semibold text-rose-500 dark:text-rose-400">{formatNumber(row.peakPower, 4, ` ${unit}`)}</td>
              <td className="px-4 py-4 text-right text-foreground/80">{formatNumber(row.mean, 4, ` ${unit}`)}</td>
              <td className="px-4 py-4 text-right text-foreground/80">{formatNumber(row.std, 4, ` ${unit}`)}</td>
              <td className="px-4 py-4 text-right text-foreground/80">{formatNumber(row.median, 4, ` ${unit}`)}</td>
              <td className="px-4 py-4 text-right font-medium text-emerald-500 dark:text-emerald-400">{formatNumber(row.min, 4, ` ${unit}`)}</td>
              <td className="px-4 py-4 text-right font-medium text-rose-500 dark:text-rose-400">{formatNumber(row.max, 4, ` ${unit}`)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function SpectrogramStatsTable({ rows, unit }: { rows: SpectrogramStats[]; unit: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/60">
            {[
              "Canal",
              "Matriz",
              "Freq. pico",
              "Tiempo pico",
              "Pot. pico",
              "Pot. media",
              "Desv.",
              "Mediana",
              "Min",
              "Max",
            ].map((header, index) => (
              <th
                key={header}
                className={cn(
                  "px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                  index === 0 ? "text-left" : "text-right"
                )}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.channel} className="border-b border-border/50 last:border-b-0 hover:bg-muted/30">
              <td className="px-4 py-4">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: CHANNEL_COLORS[row.channel] ?? "#4B5563" }}
                  />
                  <span className="font-semibold text-foreground">{formatChannel(row.channel)}</span>
                </div>
              </td>
              <td className="px-4 py-4 text-right text-muted-foreground">
                {row.frequencyBins} x {row.timeBins}
              </td>
              <td className="px-4 py-4 text-right font-semibold text-foreground">
                {formatNumber(row.peakFrequency, 2, " Hz")}
              </td>
              <td className="px-4 py-4 text-right text-foreground/80">
                {formatNumber(row.peakTime, 2, " s")}
              </td>
              <td className="px-4 py-4 text-right font-semibold text-rose-500 dark:text-rose-400">
                {formatNumber(row.peakPower, 4, ` ${unit}`)}
              </td>
              <td className="px-4 py-4 text-right text-foreground/80">
                {formatNumber(row.meanPower, 4, ` ${unit}`)}
              </td>
              <td className="px-4 py-4 text-right text-foreground/80">
                {formatNumber(row.stdPower, 4, ` ${unit}`)}
              </td>
              <td className="px-4 py-4 text-right text-foreground/80">
                {formatNumber(row.medianPower, 4, ` ${unit}`)}
              </td>
              <td className="px-4 py-4 text-right font-medium text-emerald-500 dark:text-emerald-400">
                {formatNumber(row.minPower, 4, ` ${unit}`)}
              </td>
              <td className="px-4 py-4 text-right font-medium text-rose-500 dark:text-rose-400">
                {formatNumber(row.maxPower, 4, ` ${unit}`)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
