import { useState, useMemo, useCallback } from 'react'
import { useApp, useInput, useStdout } from 'ink'
import type { ProfileResult } from '../../types.js'
import { buildDependencyTree, type ModuleNode, type DependencyTree } from '../tree.js'
import { ListView } from './ListView.js'
import { ModuleView } from './ModuleView.js'

interface Props {
  result: ProfileResult
  cwd: string
}

export function XRayApp({ result, cwd }: Props) {
  const { exit } = useApp()
  const { write } = useStdout()
  const [history, setHistory] = useState<ModuleNode[]>([])

  const tree: DependencyTree = useMemo(
    () => buildDependencyTree(result.modules, cwd),
    [result.modules, cwd]
  )

  const currentNode = history.length > 0 ? history[history.length - 1] : null

  const clearScreen = useCallback(() => {
    // ANSI escape codes: clear screen and move cursor to top-left
    write('\x1b[2J\x1b[H')
  }, [write])

  const navigateTo = (node: ModuleNode) => {
    clearScreen()
    setHistory([...history, node])
  }

  const goBack = () => {
    if (history.length > 0) {
      clearScreen()
      setHistory(history.slice(0, -1))
    }
  }

  useInput((input, key) => {
    if (input === 'q') {
      exit()
    }
    // Left arrow or backspace to go back
    if (key.leftArrow || key.backspace || key.delete) {
      if (history.length > 0) {
        goBack()
      }
    }
    // ESC only exits from home list
    if (key.escape) {
      if (history.length > 0) {
        goBack()
      } else {
        exit()
      }
    }
  })

  if (currentNode) {
    return <ModuleView node={currentNode} tree={tree} onNavigate={navigateTo} onBack={goBack} />
  }

  return <ListView tree={tree} onSelect={navigateTo} />
}
