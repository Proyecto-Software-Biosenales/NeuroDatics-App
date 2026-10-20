"use client"

import { useMemo, useState } from "react"
import { fittedAxis, fittedYAxisProps } from "../fittedAxis"

/**
 * State and axis of the «Ajustar» toggle of a line chart. `pick` lists the plotted values of
 * `source` (every series that shares the axis, so switching series never moves it); it has to be a
 * stable function, since the axis is only recalculated when the toggle, `source` or `pick` change.
 * `yAxisProps` goes on the chart's YAxis and is empty while the toggle is off.
 */
export function useFittedAxis<T>(
  source: T,
  pick: (source: T) => Iterable<number | null | undefined>
) {
  const [fit, setFit] = useState(false)
  const yAxisProps = useMemo(
    () => fittedYAxisProps(fit ? fittedAxis(pick(source)) : null),
    [fit, pick, source]
  )
  return { fit, setFit, yAxisProps }
}
