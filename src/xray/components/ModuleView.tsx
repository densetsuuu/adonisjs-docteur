import { useMemo } from 'react'
import { Box, Text } from 'ink'
import SelectInput from 'ink-select-input'
import type { DependencyTree, ModuleNode } from '../tree.js'
import {
  formatDuration,
  getEffectiveTime,
  getSubtreeTime,
  getImportChain,
  getFileIcon,
  getSourceIcon,
} from '../tree.js'

interface Props {
  node: ModuleNode
  tree: DependencyTree
  onNavigate: (node: ModuleNode) => void
  onBack: () => void
}

interface SelectItem {
  key?: string
  label: string
  value: ModuleNode | 'back'
}

interface ItemProps {
  isSelected?: boolean
  label: string
}

function ItemComponent({ isSelected = false, label }: ItemProps) {
  return (
    <Text color={isSelected ? 'blue' : undefined} bold={isSelected}>
      {label}
    </Text>
  )
}

export function ModuleView({ node, tree: _tree, onNavigate, onBack }: Props) {
  const importChain = useMemo(() => getImportChain(node), [node])
  const time = getEffectiveTime(node.timing)

  // Build navigable items list
  const items: SelectItem[] = useMemo(() => {
    const result: SelectItem[] = []

    // Back option
    result.push({
      key: 'back',
      label: '\u2190 Back',
      value: 'back',
    })

    // Import chain (why loaded) - excluding current node
    if (importChain.length > 1) {
      result.push({
        key: 'sep-why',
        label: '--- Why was this loaded? ---',
        value: 'back', // Separator, will be filtered
      })
      for (let i = 0; i < importChain.length - 1; i++) {
        const chainNode = importChain[i]
        const indent = '  '.repeat(i)
        const chainTime = getEffectiveTime(chainNode.timing)
        const fileIcon = getFileIcon(chainNode.timing.resolvedUrl)
        const sourceIcon = getSourceIcon(chainNode.timing.resolvedUrl)
        const isEntry = i === 0
        result.push({
          key: `chain-${i}-${chainNode.timing.resolvedUrl}`,
          label: `${indent}${isEntry ? '\u25B6' : '\u2514\u2500'} ${sourceIcon} ${fileIcon}  ${chainNode.displayName} (${formatDuration(chainTime)})`,
          value: chainNode,
        })
      }
      // Current node (not selectable, just for display)
      const currentIndent = '  '.repeat(importChain.length - 1)
      const currentFileIcon = getFileIcon(node.timing.resolvedUrl)
      const currentSourceIcon = getSourceIcon(node.timing.resolvedUrl)
      result.push({
        key: 'current',
        label: `${currentIndent}\u2514\u2500 ${currentSourceIcon} ${currentFileIcon}  ${node.displayName} \u2190 YOU ARE HERE`,
        value: 'back', // Not navigable
      })
    }

    // Children (what it imports) - sorted by subtree time (slowest first)
    if (node.children.length > 0) {
      const sortedChildren = [...node.children].sort((a, b) => getSubtreeTime(b) - getSubtreeTime(a))
      result.push({
        key: 'sep-imports',
        label: `--- What it imports (${node.children.length} modules) ---`,
        value: 'back', // Separator
      })
      for (let i = 0; i < Math.min(sortedChildren.length, 15); i++) {
        const child = sortedChildren[i]
        const childTime = getSubtreeTime(child)
        const childFileIcon = getFileIcon(child.timing.resolvedUrl)
        const childSourceIcon = getSourceIcon(child.timing.resolvedUrl)
        result.push({
          key: `child-${i}-${child.timing.resolvedUrl}`,
          label: `  \u25B8 ${childSourceIcon} ${childFileIcon}  ${child.displayName} (${formatDuration(childTime)})`,
          value: child,
        })
      }
      if (sortedChildren.length > 15) {
        result.push({
          key: 'more',
          label: `  ... and ${sortedChildren.length - 15} more`,
          value: 'back',
        })
      }
    }

    return result
  }, [node, importChain])

  const handleSelect = (item: SelectItem) => {
    if (item.value === 'back') {
      // Check if it's actually the back button or just a non-navigable item
      if (item.label.includes('Back')) {
        onBack()
      }
      return
    }
    onNavigate(item.value)
  }

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          {' '}{'\uf21e'} Module Details
        </Text>
      </Box>

      {/* Module info */}
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text bold color="green">
            {' '}
            {node.displayName}
          </Text>
          <Text color="yellow"> ({formatDuration(time)})</Text>
        </Box>
        <Text dimColor> {node.timing.resolvedUrl}</Text>
      </Box>

      {/* Timing breakdown */}
      <Box marginBottom={1} flexDirection="column">
        <Text dimColor> Timing breakdown:</Text>
        <Text>
          {' '}
          Load: {formatDuration(node.timing.loadTime)}
          {node.timing.execTime !== undefined && ` | Exec: ${formatDuration(node.timing.execTime)}`}
          {' '}| Resolve: {formatDuration(node.timing.resolveTime)}
        </Text>
      </Box>

      {/* Navigation list */}
      <Box flexDirection="column">
        <SelectInput items={items} onSelect={handleSelect} itemComponent={ItemComponent} />
      </Box>

      {/* Help */}
      <Box marginTop={1}>
        <Text dimColor> Left/ESC/Backspace: back | q: quit</Text>
      </Box>
    </Box>
  )
}
