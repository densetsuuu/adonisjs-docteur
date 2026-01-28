import { useMemo } from 'react'
import { Box, Text } from 'ink'
import SelectInput from 'ink-select-input'
import type { DependencyTree, ModuleNode } from '../tree.js'
import {
  formatDuration,
  getEffectiveTime,
  getImportChain,
  getFileIcon,
  getSourceIcon,
  getTimeColor,
  isDependency,
} from '../tree.js'
import { symbols } from '../../profiler/registries/index.js'

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
  if (!label) {
    return <Text> </Text>
  }
  return (
    <Text color={isSelected ? 'blue' : undefined} bold={isSelected}>
      {label}
    </Text>
  )
}

// Threshold for suggesting lazy imports (50ms)
const LAZY_IMPORT_THRESHOLD = 50

export function ModuleView({ node, tree: _tree, onNavigate, onBack }: Props) {
  const importChain = useMemo(() => getImportChain(node), [node])
  const time = getEffectiveTime(node.timing)
  const selfTime = node.timing.loadTime

  // Find heavy dependencies that could be lazy loaded
  const lazyImportCandidates = useMemo(() => {
    return node.children
      .filter((child) => {
        const childTime = getEffectiveTime(child.timing)
        return childTime >= LAZY_IMPORT_THRESHOLD && isDependency(child.timing.resolvedUrl)
      })
      .sort((a, b) => getEffectiveTime(b.timing) - getEffectiveTime(a.timing))
  }, [node.children])

  // Build navigable items list
  const items: SelectItem[] = useMemo(() => {
    const result: SelectItem[] = []

    result.push({
      key: 'back',
      label: `${symbols.arrowLeft} Back`,
      value: 'back',
    })

    // Lazy import recommendations
    if (lazyImportCandidates.length > 0 && !isDependency(node.timing.resolvedUrl)) {
      result.push({
        key: 'sep-lazy',
        label: `--- ${symbols.lightbulb} Lazy Import Candidates ---`,
        value: 'back',
      })
      for (const candidate of lazyImportCandidates.slice(0, 5)) {
        const childTime = getEffectiveTime(candidate.timing)
        const pkgName = extractPackageName(candidate.timing.resolvedUrl)
        result.push({
          key: `lazy-${candidate.timing.resolvedUrl}`,
          label: `  ${symbols.arrow} ${pkgName} (${formatDuration(childTime)}) - use dynamic import`,
          value: candidate,
        })
      }
    }

    // Import chain (why loaded)
    if (importChain.length > 1) {
      result.push({
        key: 'sep-why',
        label: '--- Why was this loaded? ---',
        value: 'back',
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
      const currentIndent = '  '.repeat(importChain.length - 1)
      const currentFileIcon = getFileIcon(node.timing.resolvedUrl)
      const currentSourceIcon = getSourceIcon(node.timing.resolvedUrl)
      result.push({
        key: 'current',
        label: `${currentIndent}\u2514\u2500 ${currentSourceIcon} ${currentFileIcon}  ${node.displayName} ${symbols.arrowLeft} YOU ARE HERE`,
        value: 'back',
      })
    }

    // Children (what it imports)
    if (node.children.length > 0) {
      const sortedChildren = [...node.children].sort(
        (a, b) => getEffectiveTime(b.timing) - getEffectiveTime(a.timing)
      )
      result.push({
        key: 'spacer-imports',
        label: '',
        value: 'back',
      })
      result.push({
        key: 'sep-imports',
        label: `--- What it imports (${node.children.length} modules) ---`,
        value: 'back',
      })
      for (let i = 0; i < Math.min(sortedChildren.length, 15); i++) {
        const child = sortedChildren[i]
        const childTime = getEffectiveTime(child.timing)
        const childFileIcon = getFileIcon(child.timing.resolvedUrl)
        const childSourceIcon = getSourceIcon(child.timing.resolvedUrl)
        const isHeavy = childTime >= LAZY_IMPORT_THRESHOLD && isDependency(child.timing.resolvedUrl)
        const childName = simplifyDisplayName(child)
        result.push({
          key: `child-${i}-${child.timing.resolvedUrl}`,
          label: `  ${isHeavy ? symbols.warning : '\u25B8'} ${childSourceIcon} ${childFileIcon}  ${childName} (${formatDuration(childTime)})`,
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
  }, [node, importChain, lazyImportCandidates])

  const handleSelect = (item: SelectItem) => {
    if (item.value === 'back') {
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
          {' '}
          {'\uf21e'} Module Details
        </Text>
      </Box>

      {/* Module info */}
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text bold color="green">
            {' '}
            {node.displayName}
          </Text>
        </Box>
        <Text dimColor> {node.timing.resolvedUrl}</Text>
      </Box>

      {/* Timing */}
      <Box marginBottom={1} flexDirection="column">
        <Box>
          <Text dimColor> Total time: </Text>
          <Text color={getTimeColor(time)}>{formatDuration(time)}</Text>
          <Text dimColor> (with dependencies)</Text>
        </Box>
        <Box>
          <Text dimColor> Self time:  </Text>
          <Text color={getTimeColor(selfTime)}>{formatDuration(selfTime)}</Text>
          <Text dimColor> (this file only)</Text>
        </Box>
      </Box>

      {/* Lazy import tip for heavy modules */}
      {lazyImportCandidates.length > 0 && !isDependency(node.timing.resolvedUrl) && (
        <Box marginBottom={1} flexDirection="column" paddingLeft={1}>
          <Text color="yellow" bold>
            {symbols.lightbulb} Optimization tip:
          </Text>
          <Text dimColor>
            {' '}
            This file imports {lazyImportCandidates.length} heavy package(s) that could be
          </Text>
          <Text dimColor> lazy-loaded with dynamic imports to reduce cold start time:</Text>
          <Box marginTop={1} flexDirection="column">
            <Text dimColor> Before: import xlsx from 'xlsx'</Text>
            <Text dimColor> After: const xlsx = await import('xlsx')</Text>
          </Box>
        </Box>
      )}

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

function extractPackageName(url: string): string {
  const match = url.match(/node_modules\/(@[^/]+\/[^/]+|[^/]+)/)
  return match?.[1] || url.split('/').pop() || url
}

function simplifyDisplayName(node: ModuleNode): string {
  const url = node.timing.resolvedUrl
  if (isDependency(url)) {
    // Find the LAST node_modules/ to handle pnpm store paths
    // e.g. .pnpm/@pkg@version/node_modules/@scope/pkg/build/index.js
    const lastIdx = url.lastIndexOf('node_modules/')
    if (lastIdx !== -1) {
      return url.slice(lastIdx + 'node_modules/'.length)
    }
  }
  return node.displayName
}
