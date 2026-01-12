import type { ModuleTiming } from '../types.js'
import { simplifyUrl } from '../profiler/collector.js'

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

function getEffectiveTime(timing: ModuleTiming): number {
  return timing.execTime ?? timing.loadTime
}

/**
 * Get the total time for a module including all its transitive dependencies.
 * This represents the actual impact of importing this module.
 */
export function getSubtreeTime(node: ModuleNode): number {
  const ownTime = getEffectiveTime(node.timing)
  let childrenTime = 0
  for (const child of node.children) {
    childrenTime += getSubtreeTime(child)
  }
  return ownTime + childrenTime
}

export function buildDependencyTree(modules: ModuleTiming[], cwd: string): DependencyTree {
  const nodeMap = new Map<string, ModuleNode>()

  // Pass 1: Create all nodes
  for (const timing of modules) {
    nodeMap.set(timing.resolvedUrl, {
      timing,
      displayName: simplifyUrl(timing.resolvedUrl, cwd),
      children: [],
      depth: 0,
    })
  }

  // Pass 2: Link parent-child relationships
  for (const node of nodeMap.values()) {
    const parentUrl = node.timing.parentUrl
    if (parentUrl && nodeMap.has(parentUrl)) {
      const parent = nodeMap.get(parentUrl)!
      parent.children.push(node)
      node.parent = parent
    }
  }

  // Pass 3: Calculate depths and identify roots
  const roots: ModuleNode[] = []
  for (const node of nodeMap.values()) {
    if (!node.parent) {
      roots.push(node)
      calculateDepths(node, 0)
    }
  }

  // Sort children by effective time (slowest first)
  for (const node of nodeMap.values()) {
    node.children.sort((a, b) => getEffectiveTime(b.timing) - getEffectiveTime(a.timing))
  }

  // Sort all nodes by effective time
  const sortedByTime = Array.from(nodeMap.values()).sort(
    (a, b) => getEffectiveTime(b.timing) - getEffectiveTime(a.timing)
  )

  return { nodeMap, roots, sortedByTime }
}

function calculateDepths(node: ModuleNode, depth: number): void {
  node.depth = depth
  for (const child of node.children) {
    calculateDepths(child, depth + 1)
  }
}

export function getImportChain(node: ModuleNode): ModuleNode[] {
  const chain: ModuleNode[] = []
  let current: ModuleNode | undefined = node

  while (current) {
    chain.unshift(current)
    current = current.parent
  }

  return chain
}

export function formatDuration(ms: number): string {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(2)}s`
  }
  return `${ms.toFixed(2)}ms`
}

export function getFileIcon(url: string): string {
  const ext = url.split('.').pop()?.toLowerCase() || ''
  switch (ext) {
    case 'ts':
    case 'tsx':
      return '\ue628' //
    case 'js':
    case 'jsx':
      return '\ue781' //
    case 'json':
      return '\ue60b' //
    case 'mjs':
    case 'cjs':
      return '\ue718' //
    case 'vue':
      return '\ue6a0' //
    case 'css':
    case 'scss':
    case 'sass':
      return '\ue749' //
    case 'html':
      return '\ue736' //
    case 'md':
      return '\ue73e' //
    default:
      return '\uf15b' //
  }
}

export type TimeColor = 'red' | 'yellow' | 'cyan' | 'green'

export function getTimeColor(ms: number): TimeColor {
  if (ms >= 100) return 'red'
  if (ms >= 50) return 'yellow'
  if (ms >= 10) return 'cyan'
  return 'green'
}

/**
 * Check if a module URL is a dependency (from node_modules) vs a project file.
 */
export function isDependency(url: string): boolean {
  return url.includes('/node_modules/')
}

/**
 * Get an icon indicating whether the module is a project file or dependency.
 */
export function getSourceIcon(url: string): string {
  return isDependency(url) ? '\uf487' : '\uf015' //  (package) vs  (home)
}

export { getEffectiveTime }
