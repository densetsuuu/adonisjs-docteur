import { Box, Text } from 'ink'
import SelectInput from 'ink-select-input'
import type { DependencyTree, ModuleNode } from '../tree.js'
import {
  formatDuration,
  getEffectiveTime,
  getFileIcon,
  getSourceIcon,
  getTimeColor,
  isDependency,
  type TimeColor,
} from '../tree.js'

interface Props {
  tree: DependencyTree
  onSelect: (node: ModuleNode) => void
}

interface SelectItem {
  key?: string
  label: string
  value: ModuleNode
  // Extra data for rendering
  timeStr: string
  timeColor: TimeColor
  fileIcon: string
  sourceIcon: string
  displayName: string
  isDep: boolean
}

interface ItemProps {
  isSelected?: boolean
  label: string
  // Extra data passed through
  timeStr?: string
  timeColor?: TimeColor
  fileIcon?: string
  sourceIcon?: string
  displayName?: string
  isDep?: boolean
}

function ItemComponent({
  isSelected = false,
  timeStr,
  timeColor,
  fileIcon,
  sourceIcon,
  displayName,
  isDep = false,
}: ItemProps) {
  if (isSelected) {
    // When selected, everything is blue and bold
    return (
      <Text color="blue" bold>
        {timeStr} {sourceIcon} {fileIcon}  {displayName}
      </Text>
    )
  }
  // Normal rendering - dim dependencies
  return (
    <Text dimColor={isDep}>
      <Text color={isDep ? undefined : timeColor}>{timeStr}</Text> {sourceIcon} {fileIcon}  {displayName}
    </Text>
  )
}

export function ListView({ tree, onSelect }: Props) {
  const items: SelectItem[] = tree.sortedByTime.slice(0, 30).map((node, index) => {
    const time = getEffectiveTime(node.timing)
    const name = node.displayName.length > 45 ? '...' + node.displayName.slice(-42) : node.displayName
    const url = node.timing.resolvedUrl
    return {
      key: `${index}-${url}`,
      label: name, // Required by SelectInput but we use custom rendering
      value: node,
      timeStr: formatDuration(time).padStart(10),
      timeColor: getTimeColor(time),
      fileIcon: getFileIcon(url),
      sourceIcon: getSourceIcon(url),
      displayName: name,
      isDep: isDependency(url),
    }
  })

  const handleSelect = (item: { value: ModuleNode }) => {
    onSelect(item.value)
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
        <Text dimColor> Use arrows to navigate, Enter to inspect, ESC to quit</Text>
      </Box>
      <Box flexDirection="column">
        <SelectInput
          items={items as Array<{ key?: string; label: string; value: ModuleNode }>}
          onSelect={handleSelect}
          itemComponent={ItemComponent}
        />
      </Box>
    </Box>
  )
}
