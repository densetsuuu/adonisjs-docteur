import { Box, Text } from 'ink'
import SelectInput from 'ink-select-input'
import type { DependencyTree, ModuleNode } from '../tree.js'
import {
  formatDuration,
  getEffectiveTime,
  getFileIcon,
  getTimeColor,
  isDependency,
  type TimeColor,
} from '../tree.js'
import { symbols } from '../../profiler/registries/index.js'

interface Props {
  tree: DependencyTree
  onSelect: (node: ModuleNode) => void
  onSwitchToProviders: () => void
  hasProviders: boolean
}

interface SelectItem {
  key?: string
  label: string
  value: ModuleNode | 'switch'
  timeStr: string
  timeColor: TimeColor
  fileIcon: string
  displayName: string
}

interface ItemProps {
  isSelected?: boolean
  label: string
  timeStr?: string
  timeColor?: TimeColor
  fileIcon?: string
  displayName?: string
}

function ItemComponent({
  isSelected = false,
  label,
  timeStr,
  timeColor,
  fileIcon,
  displayName,
}: ItemProps) {
  // Spacer
  if (!label) {
    return <Text> </Text>
  }

  // Switch button
  if (label.includes('Switch') || label.includes('Tab')) {
    return (
      <Text color={isSelected ? 'blue' : 'cyan'} bold={isSelected}>
        {label}
      </Text>
    )
  }

  if (isSelected) {
    return (
      <Text color="blue" bold>
        {timeStr} {fileIcon} {displayName}
      </Text>
    )
  }

  return (
    <Text>
      <Text color={timeColor}>{timeStr}</Text> {fileIcon} {displayName}
    </Text>
  )
}

export function ListView({ tree, onSelect, onSwitchToProviders, hasProviders }: Props) {
  // Only show app files, not node_modules
  const appModules = tree.sortedByTime.filter((node) => !isDependency(node.timing.resolvedUrl))

  const moduleItems: SelectItem[] = appModules.slice(0, 30).map((node, index) => {
    const time = getEffectiveTime(node.timing)
    const name =
      node.displayName.length > 45 ? '...' + node.displayName.slice(-42) : node.displayName
    const url = node.timing.resolvedUrl
    return {
      key: `${index}-${url}`,
      label: name,
      value: node,
      timeStr: formatDuration(time).padStart(10),
      timeColor: getTimeColor(time),
      fileIcon: getFileIcon(url),
      displayName: name,
    }
  })

  const items: SelectItem[] = hasProviders
    ? [
        ...moduleItems,
        {
          key: 'spacer',
          label: '',
          value: 'switch' as const,
          timeStr: '',
          timeColor: 'green',
          fileIcon: '',
          displayName: '',
        },
        {
          key: 'switch',
          label: `${symbols.lightning} Switch to Providers (Tab)`,
          value: 'switch' as const,
          timeStr: '',
          timeColor: 'green',
          fileIcon: '',
          displayName: '',
        },
      ]
    : moduleItems

  const handleSelect = (item: { value: ModuleNode | 'switch' }) => {
    if (item.value === 'switch') {
      onSwitchToProviders()
    } else {
      onSelect(item.value)
    }
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">
          {' '}
          {'\ue234'} Docteur X-Ray - Module Explorer
        </Text>
      </Box>
      <Box marginBottom={1}>
        <Text dimColor> Use arrows to navigate, Enter to inspect, Tab to switch views</Text>
      </Box>
      <Box flexDirection="column">
        <SelectInput
          items={items as Array<{ key?: string; label: string; value: ModuleNode | 'switch' }>}
          onSelect={handleSelect}
          itemComponent={ItemComponent}
        />
      </Box>
    </Box>
  )
}
