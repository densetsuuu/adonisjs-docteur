# Docteur

> AdonisJS cold start profiler - Analyze and optimize your application boot time

Docteur profiles your AdonisJS application's cold start performance. It measures how long each module takes to load and helps you identify bottlenecks in your boot process.

## Installation

Install globally:

```bash
npm install -g @densetsuuu/docteur
# or
pnpm add -g @densetsuuu/docteur
```

## Usage

Navigate to your AdonisJS project and run:

```bash
# Quick diagnosis
docteur diagnose

# Interactive explorer
docteur xray
```

### Commands

#### `docteur diagnose`

Analyzes cold start performance and displays a report.

```bash
docteur diagnose [options]
```

| Option              | Description                             | Default         |
| ------------------- | --------------------------------------- | --------------- |
| `--top`             | Number of slowest modules to display    | 20              |
| `--threshold`       | Only show modules slower than this (ms) | 1               |
| `--no-node-modules` | Exclude node_modules from analysis      | false           |
| `--no-group`        | Don't group modules by package          | false           |
| `--entry`           | Custom entry point to profile           | `bin/server.ts` |

#### `docteur xray`

Interactive TUI for exploring module dependencies.

```bash
docteur xray [options]
```

| Option    | Description        | Default         |
| --------- | ------------------ | --------------- |
| `--entry` | Custom entry point | `bin/server.ts` |

**Features:**

- Browse slowest modules
- Drill down into module dependencies
- See why a module was loaded (import chain)
- View lazy import recommendations for heavy dependencies
- Explore provider lifecycle times (register, boot, start, ready)

**Keyboard shortcuts:**

- `↑/↓` Navigate
- `Enter` Select
- `Tab` Switch between Modules/Providers view
- `←/Backspace/ESC` Go back
- `q` Quit

### Example Output

```
  🩺 Docteur - Cold Start Analysis
  ─────────────────────────────────

  📊 Summary

  Total boot time:       459.26ms
  Total modules loaded:  447
    App modules:         19
    Node modules:        221
    AdonisJS modules:    186
  Module import time:    72.91ms
  Provider exec time:    12.35ms

  📁 App Files by Category

  🚀 Start Files (4 files, 15.23ms)
  ┌───────────────────────┬──────────┬──────────┬────────────────────────┐
  │ routes.ts             │ 10.53ms  │ 0.19ms   │ █████████████████████  │
  │ kernel.ts             │  2.15ms  │ 0.08ms   │ ████░░░░░░░░░░░░░░░░░  │
  │ env.ts                │  1.89ms  │ 0.12ms   │ ████░░░░░░░░░░░░░░░░░  │
  └───────────────────────┴──────────┴──────────┴────────────────────────┘

  ⚡ Provider Execution Times
  Time spent in register() and boot() methods

  ┌─────────────────────┬──────────┬──────────┬──────────┬────────────┐
  │ Provider            │ Register │ Boot     │ Total    │            │
  ├─────────────────────┼──────────┼──────────┼──────────┼────────────┤
  │ EdgeServiceProvider │ 0.15ms   │ 2.76ms   │ 2.91ms   │ ████████   │
  │ HashServiceProvider │ 0.08ms   │ 1.23ms   │ 1.31ms   │ ████       │
  └─────────────────────┴──────────┴──────────┴──────────┴────────────┘

  ✅ No major issues detected!
```

## How It Works

Docteur measures cold start performance through two complementary approaches:

1. **Module Loading**: Uses Node.js ESM loader hooks to intercept every `import()` and measure how long each module takes to load.

2. **Provider Lifecycle**: Subscribes to AdonisJS's built-in tracing channels to measure the duration of provider lifecycle methods (register, boot, start, ready).

### Timing Columns

- **Total**: Time including all transitive dependencies (cascading impact)
- **Self**: Time for just that file (excluding dependencies)

### Execution Flow

```
1. docteur diagnose
       │
       ▼
2. Spawns child process with --import loader.ts
       │
       ▼
3. loader.ts registers ESM hooks + subscribes to tracing channels
       │
       ▼
4. hooks.ts intercepts every import, measures load time
       │
       ▼
5. AdonisJS app starts, HTTP server listens
       │
       ▼
6. CLI detects "started HTTP server", requests results
       │
       ▼
7. Results sent via IPC, report displayed
```

## Requirements

- AdonisJS v7+
- Node.js 21+

## License

MIT
