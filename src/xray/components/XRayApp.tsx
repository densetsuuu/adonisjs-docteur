import { useState, useMemo, useCallback } from 'react'
import { useApp, useInput, useStdout } from 'ink'
import type { ProfileResult, ProviderTiming } from '../../types.js'
import { buildDependencyTree, type ModuleNode, type DependencyTree } from '../tree.js'
import { ListView } from './ListView.js'
import { ModuleView } from './ModuleView.js'
import { ProviderListView } from './ProviderListView.js'
import { ProviderView } from './ProviderView.js'

interface Props {
  result: ProfileResult
  cwd: string
}

type View = 'modules' | 'providers'

export function XRayApp({ result, cwd }: Props) {
  const { exit } = useApp()
  const { write } = useStdout()
  const [view, setView] = useState<View>('modules')
  const [moduleHistory, setModuleHistory] = useState<ModuleNode[]>([])
  const [selectedProvider, setSelectedProvider] = useState<ProviderTiming | null>(null)

  const tree: DependencyTree = useMemo(
    () => buildDependencyTree(result.modules, cwd),
    [result.modules, cwd]
  )

  const currentModule = moduleHistory.length > 0 ? moduleHistory[moduleHistory.length - 1] : null

  const clearScreen = useCallback(() => {
    write('\x1b[2J\x1b[H')
  }, [write])

  const navigateToModule = (node: ModuleNode) => {
    clearScreen()
    setModuleHistory([...moduleHistory, node])
  }

  const goBack = () => {
    clearScreen()
    if (selectedProvider) {
      setSelectedProvider(null)
    } else if (moduleHistory.length > 0) {
      setModuleHistory(moduleHistory.slice(0, -1))
    }
  }

  const switchView = (newView: View) => {
    clearScreen()
    setView(newView)
    setModuleHistory([])
    setSelectedProvider(null)
  }

  useInput((input, key) => {
    if (input === 'q') {
      exit()
    }
    if (key.leftArrow || key.backspace || key.delete) {
      if (selectedProvider || moduleHistory.length > 0) {
        goBack()
      }
    }
    if (key.escape) {
      if (selectedProvider || moduleHistory.length > 0) {
        goBack()
      } else {
        exit()
      }
    }
    // Tab to switch between views (when at root)
    if (key.tab && !currentModule && !selectedProvider) {
      switchView(view === 'modules' ? 'providers' : 'modules')
    }
  })

  // Provider detail view
  if (selectedProvider) {
    return <ProviderView provider={selectedProvider} onBack={goBack} />
  }

  // Module detail view
  if (currentModule) {
    return (
      <ModuleView node={currentModule} tree={tree} onNavigate={navigateToModule} onBack={goBack} />
    )
  }

  // Providers list view
  if (view === 'providers') {
    return (
      <ProviderListView
        providers={result.providers}
        onSelect={(p) => {
          clearScreen()
          setSelectedProvider(p)
        }}
        onSwitchToModules={() => switchView('modules')}
      />
    )
  }

  // Modules list view (default)
  return (
    <ListView
      tree={tree}
      onSelect={navigateToModule}
      onSwitchToProviders={() => switchView('providers')}
      hasProviders={result.providers.length > 0}
    />
  )
}
