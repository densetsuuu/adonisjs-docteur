import { Box, Text } from 'ink'
import SelectInput from 'ink-select-input'
import type { ProviderTiming } from '../../types.js'
import { formatDuration, getTimeColor } from '../tree.js'
import { symbols } from '../../profiler/registries/index.js'

interface Props {
  provider: ProviderTiming
  onBack: () => void
}

function Bar({ value, max, width = 30 }: { value: number; max: number; width?: number }) {
  const ratio = max > 0 ? Math.min(value / max, 1) : 0
  const filled = Math.round(ratio * width)
  const bar = symbols.barFull.repeat(filled) + symbols.barEmpty.repeat(width - filled)
  const color = getTimeColor(value)

  return <Text color={color}>{bar}</Text>
}

interface PhaseRowProps {
  label: string
  value: number
  max: number
}

function PhaseRow({ label, value, max }: PhaseRowProps) {
  const timeStr = formatDuration(value).padStart(10)
  const color = getTimeColor(value)

  return (
    <Box>
      <Text dimColor>{label.padEnd(12)}</Text>
      <Text color={color}>{timeStr}</Text>
      <Text> </Text>
      <Bar value={value} max={max} width={25} />
    </Box>
  )
}

export function ProviderView({ provider, onBack }: Props) {
  const phases = [
    { label: 'register()', value: provider.registerTime },
    { label: 'boot()', value: provider.bootTime },
    { label: 'start()', value: provider.startTime },
    { label: 'ready()', value: provider.readyTime },
  ]

  const maxPhaseTime = Math.max(...phases.map((p) => p.value), 1)

  const items = [{ key: 'back', label: `${symbols.arrowLeft} Back`, value: 'back' as const }]

  const handleSelect = (item: { value: string }) => {
    if (item.value === 'back') {
      onBack()
    }
  }

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          {' '}
          {symbols.lightning} Provider Details
        </Text>
      </Box>

      {/* Provider name */}
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text bold color="green">
            {' '}
            {symbols.provider} {provider.name}
          </Text>
        </Box>
        <Box>
          <Text dimColor> Total execution time: </Text>
          <Text color={getTimeColor(provider.totalTime)}>{formatDuration(provider.totalTime)}</Text>
        </Box>
      </Box>

      {/* Lifecycle phases */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold> Lifecycle Breakdown:</Text>
        <Text dimColor> Time spent in each provider method</Text>
        <Box marginTop={1} flexDirection="column">
          {phases.map((phase) => (
            <PhaseRow
              key={phase.label}
              label={phase.label}
              value={phase.value}
              max={maxPhaseTime}
            />
          ))}
        </Box>
      </Box>

      {/* Explanation */}
      <Box flexDirection="column" marginBottom={1} paddingLeft={1}>
        <Text dimColor>
          {symbols.bullet} register(): Container bindings, executed for all providers first
        </Text>
        <Text dimColor>
          {symbols.bullet} boot(): Initialization logic, after all providers registered
        </Text>
        <Text dimColor>{symbols.bullet} start(): Called when HTTP server starts</Text>
        <Text dimColor>{symbols.bullet} ready(): Called when app is fully ready</Text>
      </Box>

      {/* Navigation */}
      <Box flexDirection="column">
        <SelectInput items={items} onSelect={handleSelect} />
      </Box>

      {/* Help */}
      <Box marginTop={1}>
        <Text dimColor> Left/ESC/Backspace: back | q: quit</Text>
      </Box>
    </Box>
  )
}
