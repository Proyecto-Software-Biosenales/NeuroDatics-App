import type { AOI, scenaries } from "./types"

export const AOI_COLORS = [
  "#3B82F6",
  "#14B8A6",
  "#EF4444",
  "#F59E0B",
  "#8B5CF6", 
  "#ff1576", 
]

type ApiAoiLike = {
  id?: string
  name?: string
  color?: string | null
  shape_type?: string | null
  shape?: Record<string, unknown> | null
}

const toNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

type AoiPoint = NonNullable<AOI["points"]>[number]

const normalizePoint = (point: AoiPoint): AoiPoint => ({
  x: clamp(point.x, 0, 100),
  y: clamp(point.y, 0, 100),
})

const parseAoiPoints = (value: unknown): AoiPoint[] => {
  if (!Array.isArray(value)) return []

  return value
    .map((point) => {
      if (!point || typeof point !== "object") return null
      const raw = point as Record<string, unknown>
      return normalizePoint({
        x: toNumber(raw.x, Number.NaN),
        y: toNumber(raw.y, Number.NaN),
      })
    })
    .filter((point): point is AoiPoint => {
      if (!point) return false
      return Number.isFinite(point.x) && Number.isFinite(point.y)
    })
}

const pointKey = (point: AoiPoint) => `${point.x.toFixed(4)}:${point.y.toFixed(4)}`

export const normalizeAoiPoints = (points: AoiPoint[] | undefined): AoiPoint[] => {
  const unique: AoiPoint[] = []
  const seen = new Set<string>()

  for (const point of points || []) {
    const normalized = normalizePoint(point)
    const key = pointKey(normalized)
    if (!seen.has(key)) {
      unique.push(normalized)
      seen.add(key)
    }
  }

  return unique
}

export const getAoiBoundsFromPoints = (points: AoiPoint[]) => {
  if (points.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }

  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const x = clamp(Math.min(...xs), 0, 100)
  const y = clamp(Math.min(...ys), 0, 100)
  const maxX = clamp(Math.max(...xs), 0, 100)
  const maxY = clamp(Math.max(...ys), 0, 100)

  return {
    x,
    y,
    width: clamp(maxX - x, 0, 100 - x),
    height: clamp(maxY - y, 0, 100 - y),
  }
}

export const isPolygonAoi = (aoi: AOI) => (
  aoi.shapeType === "polygon" && normalizeAoiPoints(aoi.points).length >= 3
)

export const normalizeAoiRect = (aoi: AOI): AOI => {
  const points = normalizeAoiPoints(aoi.points)
  const shapeType = aoi.shapeType === "polygon" && points.length >= 3
    ? "polygon"
    : aoi.shapeType === "circle"
      ? "circle"
      : "rect"
  const rect = shapeType === "polygon"
    ? getAoiBoundsFromPoints(points)
    : {
        x: clamp(aoi.x, 0, 100),
        y: clamp(aoi.y, 0, 100),
        width: 0,
        height: 0,
      }
  const x = rect.x
  const y = rect.y
  const width = shapeType === "polygon" ? rect.width : clamp(aoi.width, 0, 100 - x)
  const height = shapeType === "polygon" ? rect.height : clamp(aoi.height, 0, 100 - y)

  return {
    ...aoi,
    color: aoi.color || AOI_COLORS[0],
    shapeType,
    x,
    y,
    width,
    height,
    points: shapeType === "polygon" ? points : undefined,
  }
}

export const apiAoiToFormAoi = (apiAoi: ApiAoiLike, index = 0): AOI => {
  const shape = apiAoi.shape || {}
  return normalizeAoiRect({
    id: apiAoi.id || `aoi-${Date.now()}-${index}`,
    name: apiAoi.name || `AOI ${index + 1}`,
    color: apiAoi.color || AOI_COLORS[index % AOI_COLORS.length],
    shapeType:
      apiAoi.shape_type === "circle" || apiAoi.shape_type === "polygon"
        ? apiAoi.shape_type
        : "rect",
    x: toNumber(shape.x, 0),
    y: toNumber(shape.y, 0),
    width: toNumber(shape.width, 20),
    height: toNumber(shape.height, 20),
    points: parseAoiPoints(shape.points),
  })
}

const serializeAoiShape = (aoi: AOI) => {
  const normalized = normalizeAoiRect(aoi)
  const shape = {
    x: Number(normalized.x.toFixed(4)),
    y: Number(normalized.y.toFixed(4)),
    width: Number(normalized.width.toFixed(4)),
    height: Number(normalized.height.toFixed(4)),
  }

  if (normalized.shapeType !== "polygon" || !normalized.points?.length) {
    return shape
  }

  return {
    ...shape,
    points: normalized.points.map((point) => ({
      x: Number(point.x.toFixed(4)),
      y: Number(point.y.toFixed(4)),
    })),
  }
}

export const serializeScenaryAois = (scenaries: scenaries[]) =>
  scenaries.flatMap((scenary) =>
    (scenary.aois || [])
      .map(normalizeAoiRect)
      .filter((aoi) => (
        aoi.name.trim() &&
        aoi.width > 0 &&
        aoi.height > 0 &&
        (aoi.shapeType !== "polygon" || (aoi.points?.length ?? 0) >= 3)
      ))
      .map((aoi) => ({
        scenaries_name: scenary.name,
        name: aoi.name.trim(),
        color: aoi.color || AOI_COLORS[0],
        shape_type: aoi.shapeType || "rect",
        shape: serializeAoiShape(aoi),
      }))
  )

export const serializeAoisForComparison = (scenaries: scenaries[]) =>
  JSON.stringify(
    scenaries.map((scenary) => ({
      id: scenary.id,
      name: scenary.name,
      aois: (scenary.aois || []).map((aoi) => {
        const normalized = normalizeAoiRect(aoi)
        return {
          id: normalized.id,
          name: normalized.name,
          color: normalized.color,
          shapeType: normalized.shapeType || "rect",
          x: Number(normalized.x.toFixed(4)),
          y: Number(normalized.y.toFixed(4)),
          width: Number(normalized.width.toFixed(4)),
          height: Number(normalized.height.toFixed(4)),
          points: normalized.shapeType === "polygon"
            ? normalized.points?.map((point) => ({
                x: Number(point.x.toFixed(4)),
                y: Number(point.y.toFixed(4)),
              }))
            : undefined,
        }
      }),
    }))
  )
