import { Box, Text } from 'ink'
import SelectInput from 'ink-select-input'
import type { ProviderTiming } from '../../types.js'
import { formatDuration, getTimeColor, type TimeColor } from '../tree.js'
import { symbols } from '../../profiler/registries/index.js'

interface Props {
  providers: ProviderTiming[]
  onSelect: (provider: ProviderTiming) => void
  onSwitchToModules: () => void
}

interface SelectItem {
  key: string
  label: string
  value: ProviderTiming | 'switch'
  timeStr: string
  timeColor: TimeColor
  name: string
}

interface ItemProps {
  isSelected?: boolean
  label: string
  timeStr?: string
  timeColor?: TimeColor
  name?: string
}

function ItemComponent({ isSelected = false, timeStr, timeColor, name, label }: ItemProps) {
  // Spacer
  if (!label) {
    return <Text> </Text>
  }

  // Switch button
  if (label.includes('Switch')) {
    return (
      <Text color={isSelected ? 'blue' : 'cyan'} bold={isSelected}>
        {label}
      </Text>
    )
  }

  if (isSelected) {
    return (
      <Text color="blue" bold>
        {timeStr} {symbols.provider} {name}
      </Text>
    )
  }

  return (
    <Text>
      <Text color={timeColor}>{timeStr}</Text> {symbols.provider} {name}
    </Text>
  )
}

export function ProviderListView({ providers, onSelect, onSwitchToModules }: Props) {
  const sorted = [...providers].sort((a, b) => b.totalTime - a.totalTime)

  const items: SelectItem[] = [
    ...sorted.map((provider, index) => ({
      key: `${index}-${provider.name}`,
      label: provider.name,
      value: provider,
      timeStr: formatDuration(provider.totalTime).padStart(10),
      timeColor: getTimeColor(provider.totalTime),
      name: provider.name,
    })),
    {
      key: 'spacer',
      label: '',
      value: 'switch' as const,
      timeStr: '',
      timeColor: 'green',
      name: '',
    },
    {
      key: 'switch',
      label: `${symbols.turtle} Switch to Modules (Tab)`,
      value: 'switch' as const,
      timeStr: '',
      timeColor: 'green',
      name: '',
    },
  ]

  const handleSelect = (item: { value: ProviderTiming | 'switch' }) => {
    if (item.value === 'switch') {
      onSwitchToModules()
    } else {
      onSelect(item.value)
    }
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">
          {' '}
          {symbols.lightning} Docteur X-Ray - Provider Explorer
        </Text>
      </Box>
      <Box marginBottom={1}>
        <Text dimColor>
          {' '}
          Time spent in register() + boot() + start() + ready() lifecycle methods
        </Text>
      </Box>
      <Box marginBottom={1}>
        <Text dimColor> Use arrows to navigate, Enter to inspect, ESC to quit</Text>
      </Box>
      <Box flexDirection="column">
        <SelectInput
          items={items as Array<{ key: string; label: string; value: ProviderTiming | 'switch' }>}
          onSelect={handleSelect}
          itemComponent={ItemComponent}
        />
      </Box>
    </Box>
  )
}
