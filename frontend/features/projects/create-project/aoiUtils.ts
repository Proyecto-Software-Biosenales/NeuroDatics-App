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

export const normalizeAoiRect = (aoi: AOI): AOI => {
  const x = clamp(aoi.x, 0, 100)
  const y = clamp(aoi.y, 0, 100)
  const width = clamp(aoi.width, 0, 100 - x)
  const height = clamp(aoi.height, 0, 100 - y)

  return {
    ...aoi,
    color: aoi.color || AOI_COLORS[0],
    shapeType: aoi.shapeType || "rect",
    x,
    y,
    width,
    height,
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
  })
}

export const serializeScenaryAois = (scenaries: scenaries[]) =>
  scenaries.flatMap((scenary) =>
    (scenary.aois || [])
      .map(normalizeAoiRect)
      .filter((aoi) => aoi.name.trim() && aoi.width > 0 && aoi.height > 0)
      .map((aoi) => ({
        scenaries_name: scenary.name,
        name: aoi.name.trim(),
        color: aoi.color || AOI_COLORS[0],
        shape_type: aoi.shapeType || "rect",
        shape: {
          x: Number(aoi.x.toFixed(4)),
          y: Number(aoi.y.toFixed(4)),
          width: Number(aoi.width.toFixed(4)),
          height: Number(aoi.height.toFixed(4)),
        },
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
        }
      }),
    }))
  )
