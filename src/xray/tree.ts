/*
|--------------------------------------------------------------------------
| Dependency Tree
|--------------------------------------------------------------------------
|
| Builds a tree structure from module timings for the xray TUI.
| Provides utilities for traversing and displaying the tree.
|
*/

import type { ModuleTiming } from '../types.js'
import { formatDuration, getEffectiveTime, simplifyUrl } from '../profiler/reporters/format.js'
import { fileIcons, symbols } from '../profiler/registries/index.js'

export interface ModuleNode {
  timing: ModuleTiming
  displayName: string
  children: ModuleNode[]
  parent?: ModuleNode
  depth: number
}

export interface DependencyTree {
  nodeMap: Map<string, ModuleNode>
  roots: ModuleNode[]
  sortedByTime: ModuleNode[]
}

export function buildDependencyTree(modules: ModuleTiming[], cwd: string): DependencyTree {
  const nodeMap = new Map<string, ModuleNode>()
  const time = (n: ModuleNode) => getEffectiveTime(n.timing)

  // Create all nodes
  for (const timing of modules) {
    nodeMap.set(timing.resolvedUrl, {
      timing,
      displayName: simplifyUrl(timing.resolvedUrl, cwd),
      children: [],
      depth: 0,
    })
  }

  for (const node of nodeMap.values()) {
    const parentUrl = node.timing.parentUrl
    if (parentUrl && nodeMap.has(parentUrl)) {
      const parent = nodeMap.get(parentUrl)!
      parent.children.push(node)
      node.parent = parent
    }
  }

  // Calculate depths and identify roots
  const roots: ModuleNode[] = []
  const setDepths = (node: ModuleNode, depth: number, seen = new Set<ModuleNode>()) => {
    if (seen.has(node)) return
    seen.add(node)
    node.depth = depth
    for (const child of node.children) setDepths(child, depth + 1, seen)
  }

  for (const node of nodeMap.values()) {
    if (!node.parent) {
      roots.push(node)
      setDepths(node, 0)
    }
  }

  // Sort children by time (slowest first)
  for (const node of nodeMap.values()) {
    node.children.sort((a, b) => time(b) - time(a))
  }

  const sortedByTime = [...nodeMap.values()].sort((a, b) => time(b) - time(a))

  return { nodeMap, roots, sortedByTime }
}

export function getImportChain(node: ModuleNode): ModuleNode[] {
  const chain: ModuleNode[] = []
  const seen = new Set<ModuleNode>()
  let current: ModuleNode | undefined = node

  while (current && !seen.has(current)) {
    seen.add(current)
    chain.unshift(current)
    current = current.parent
  }

  return chain
}

export function getFileIcon(url: string): string {
  const ext = url.split('.').pop()?.toLowerCase() || ''
  return fileIcons[ext] || fileIcons.default
}

export type TimeColor = 'red' | 'yellow' | 'cyan' | 'green'

export function getTimeColor(ms: number): TimeColor {
  if (ms >= 100) return 'red'
  if (ms >= 50) return 'yellow'
  if (ms >= 10) return 'cyan'
  return 'green'
}

export function isDependency(url: string): boolean {
  return url.includes('/node_modules/')
}

export function getSourceIcon(url: string): string {
  return isDependency(url) ? symbols.sourcePackage : symbols.sourceHome
}

export { formatDuration, getEffectiveTime }
