import { Button } from "@/components/ui/button"
import { CHANNEL_COLORS } from "./eegViewShared"
import { formatChannel } from "../../eegPresentation"

export function EegChannelSelector({ channels, availableChannels, selectedChannels, onToggle }: {
  channels: readonly string[]
  availableChannels: readonly string[]
  selectedChannels: readonly string[]
  onToggle: (channel: string) => void
}) {
  return (
    <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Canales EEG">
      {channels.map((channel) => {
        const available = availableChannels.includes(channel)
        const active = available && selectedChannels.includes(channel)
        return (
          <Button key={channel} variant="outline" aria-pressed={active} disabled={!available}
            onClick={() => onToggle(channel)}
            className="min-w-12 aria-pressed:border-transparent aria-pressed:text-white"
            style={active ? { backgroundColor: CHANNEL_COLORS[channel] } : undefined}>
            {formatChannel(channel)}
          </Button>
        )
      })}
    </div>
  )
}
