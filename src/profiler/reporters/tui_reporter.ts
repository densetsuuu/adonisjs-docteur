/*
|--------------------------------------------------------------------------
| TUI Reporter
|--------------------------------------------------------------------------
|
| Interactive terminal UI reporter using Ink.
| Renders an explorable dependency tree view.
|
*/

import React from 'react'
import { render } from 'ink'
import type { Reporter, ReportContext } from './base_reporter.js'
import { XRayApp } from '../../xray/components/XRayApp.js'

export class TuiReporter implements Reporter {
  /**
   * Renders an interactive TUI report using the XRay explorer.
   * Enters alternate screen buffer for a clean experience.
   */
  async render(context: ReportContext): Promise<void> {
    const { result, cwd } = context

    // Enter alternate screen buffer
    process.stdout.write('\x1b[?1049h')
    process.stdout.write('\x1b[H')

    try {
      const { waitUntilExit } = render(React.createElement(XRayApp, { result, cwd }))
      await waitUntilExit()
    } finally {
      // Exit alternate screen buffer
      process.stdout.write('\x1b[?1049l')
    }
  }
}
