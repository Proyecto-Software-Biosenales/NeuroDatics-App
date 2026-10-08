"use client"

import type { ElementType, ReactNode } from "react"
import {
  Activity,
  ArrowRight,
  ArrowRightLeft,
  CircleCheck,
  EyeOff,
  Hourglass,
  Repeat,
  Timer,
} from "lucide-react"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { InfoChip } from "../InfoChip"
import { AoiName } from "./AoiName"
import {
  formatDecimal,
  formatMilliseconds,
  formatPercent,
  formatSeconds,
  formatSignedDecimal,
  plural,
  type AoiFindings,
} from "../../aoiInsights"

function FindingTile({
  Icon,
  iconClassName,
  label,
  subjects,
  value,
  detail,
}: {
  Icon: ElementType
  iconClassName: string
  label: string
  subjects: ReactNode
  value: string
  detail: string
}) {
  return (
    <li className="flex min-w-0 gap-3 rounded-xl border border-border bg-background p-3">
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted", iconClassName)}>
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
          {subjects}
        </div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          <span className="font-semibold tabular-nums text-foreground">{value}</span> {detail}
        </p>
      </div>
    </li>
  )
}

const READING_NOTES = [
  "Primera en captar la mirada: el AOI con menor TTFF, medido desde el inicio del escenario.",
  "Fijaciones largas suelen indicar un procesamiento más profundo o más costoso del contenido.",
  "Una visita empieza cada vez que la mirada entra en el área; fijar fuera de ella la cierra.",
  "Una conexión suma los saltos en los dos sentidos entre dos áreas; mucho ir y venir suele indicar que se estaban comparando.",
  "La pupila también responde al brillo de cada zona: compara AOIs de luminancia parecida.",
]

/** The tab's conclusions in one glance; the evidence is in the cards below. */
export function AoiFindingsCard({ findings }: { findings: AoiFindings }) {
  const tiles: ReactNode[] = []
  const { first, longestFixations, mostVisited, pupil, topLink, unseen, total } = findings

  if (first) {
    const order = first.aoi.fixations_to_target
    tiles.push(
      <FindingTile
        key="first"
        Icon={Timer}
        iconClassName="text-sky-600 dark:text-sky-300"
        label="Primera en captar la mirada"
        subjects={<AoiName aoi={first.aoi} />}
        value={first.ttffS != null ? formatSeconds(first.ttffS) : `Fijación nº ${order ?? "—"}`}
        detail={first.ttffS != null
          ? `tras el inicio${order != null ? ` · fijación nº ${order}` : ""}`
          : "del escenario"}
      />
    )
  }

  if (longestFixations) {
    tiles.push(
      <FindingTile
        key="longest"
        Icon={Hourglass}
        iconClassName="text-amber-600 dark:text-amber-300"
        label="Fijaciones más largas"
        subjects={<AoiName aoi={longestFixations.aoi} />}
        value={formatMilliseconds(longestFixations.avgMs)}
        detail={`de media en ${plural(longestFixations.count, "fijación", "fijaciones")}`}
      />
    )
  }

  if (mostVisited) {
    const returns = mostVisited.visits - 1
    tiles.push(
      <FindingTile
        key="visits"
        Icon={Repeat}
        iconClassName="text-indigo-600 dark:text-indigo-300"
        label="Más revisitada"
        subjects={<AoiName aoi={mostVisited.aoi} />}
        value={plural(mostVisited.visits, "visita", "visitas")}
        detail={`· la mirada volvió ${plural(returns, "vez", "veces")}`}
      />
    )
  }

  if (pupil) {
    tiles.push(
      <FindingTile
        key="pupil"
        Icon={Activity}
        iconClassName="text-violet-600 dark:text-violet-300"
        label="Pupila más dilatada"
        subjects={<AoiName aoi={pupil.aoi} />}
        value={`${formatSignedDecimal(pupil.deltaPercent, 1)} %`}
        detail={`sobre la línea base${pupil.avgMm != null ? ` · ${formatDecimal(pupil.avgMm, 2)} mm de media` : ""}`}
      />
    )
  }

  if (topLink) {
    const bothWays = topLink.backward > 0
    const LinkIcon = bothWays ? ArrowRightLeft : ArrowRight
    tiles.push(
      <FindingTile
        key="link"
        Icon={ArrowRightLeft}
        iconClassName="text-emerald-700 dark:text-emerald-300"
        label="Conexión más frecuente"
        subjects={(
          <>
            <AoiName aoi={topLink.a} />
            <LinkIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="sr-only">{bothWays ? "y" : "hacia"}</span>
            <AoiName aoi={topLink.b} />
          </>
        )}
        value={plural(topLink.total, "transición", "transiciones")}
        detail={`· ${formatPercent(topLink.sharePercent, 0)} del total${
          bothWays
            ? ` (${topLink.forward} de ida, ${topLink.backward} de vuelta)`
            : ", siempre en ese sentido"
        }`}
      />
    )
  }

  if (unseen.length > 0) {
    const shown = unseen.slice(0, 3)
    tiles.push(
      <FindingTile
        key="unseen"
        Icon={EyeOff}
        iconClassName="text-rose-600 dark:text-rose-300"
        label="Sin fijaciones"
        subjects={(
          <>
            {shown.map((aoi) => <AoiName key={aoi.id} aoi={aoi} />)}
            {unseen.length > shown.length ? (
              <span className="text-xs text-muted-foreground">+{unseen.length - shown.length}</span>
            ) : null}
          </>
        )}
        value={`${unseen.length} de ${total} AOIs`}
        detail={unseen.length === 1 ? "no recibió ninguna fijación" : "no recibieron ninguna fijación"}
      />
    )
  } else if (total > 0) {
    tiles.push(
      <FindingTile
        key="coverage"
        Icon={CircleCheck}
        iconClassName="text-emerald-700 dark:text-emerald-300"
        label="Cobertura"
        subjects={<span className="font-medium text-foreground">Todas las AOIs</span>}
        value={`${total} de ${total}`}
        detail="recibieron al menos una fijación"
      />
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Hallazgos clave</CardTitle>
        <CardDescription>
          Lo más destacado de este participante en el escenario. El detalle está en las secciones siguientes.
        </CardDescription>
        <CardAction>
          <InfoChip
            label="Cómo leerlos"
            detail={READING_NOTES.map((note) => <span key={note}>{note}</span>)}
          />
        </CardAction>
      </CardHeader>
      <CardContent>
        {tiles.length === 0 ? (
          <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 px-4 text-center text-sm text-muted-foreground">
            No hay fijaciones sobre las AOIs para extraer hallazgos.
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{tiles}</ul>
        )}
      </CardContent>
    </Card>
  )
}
