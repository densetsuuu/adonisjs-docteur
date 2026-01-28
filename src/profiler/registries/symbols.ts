/*
|--------------------------------------------------------------------------
| Unicode Symbols Registry
|--------------------------------------------------------------------------
|
| Centralized registry of Unicode symbols used throughout the UI.
| Access via: symbols.controller, symbols.checkmark, etc.
|
*/

export const symbols = {
  // App file categories
  controller: '\uD83C\uDFAE', // 🎮
  service: '\u2699\uFE0F', // ⚙️
  model: '\uD83D\uDCE6', // 📦
  middleware: '\uD83D\uDD17', // 🔗
  validator: '\u2705', // ✅
  exception: '\uD83D\uDCA5', // 💥
  event: '\uD83D\uDCE1', // 📡
  listener: '\uD83D\uDC42', // 👂
  mailer: '\uD83D\uDCE7', // 📧
  policy: '\uD83D\uDD10', // 🔐
  command: '\u2328\uFE0F', // ⌨️
  provider: '\uD83D\uDD0C', // 🔌
  config: '\u2699\uFE0F', // ⚙️
  start: '\uD83D\uDE80', // 🚀
  file: '\uD83D\uDCC4', // 📄
  folder: '\uD83D\uDCC1', // 📁

  // Status & UI
  checkmark: '\u2705', // ✅
  cross: '\u274C', // ❌
  warning: '\u26A0\uFE0F', // ⚠️
  info: '\u2139\uFE0F', // ℹ️
  lightning: '\u26A1', // ⚡
  turtle: '\uD83D\uDC22', // 🐢
  package: '\uD83D\uDCE6', // 📦
  chart: '\uD83D\uDCCA', // 📊
  lightbulb: '\uD83D\uDCA1', // 💡
  stethoscope: '\uD83E\uDE7A', // 🩺

  // Bars (for progress indicators)
  barFull: '\u2588', // █
  barEmpty: '\u2591', // ░
  barMedium: '\u2592', // ▒
  barLight: '\u2593', // ▓

  // Misc
  dash: '\u2500', // ─
  bullet: '\u2022', // •
  arrow: '\u2192', // →
  arrowLeft: '\u2190', // ←
  arrowUp: '\u2191', // ↑
  arrowDown: '\u2193', // ↓

  // Nerd Font source icons (for TUI)
  sourcePackage: '\uf487',
  sourceHome: '\uf015',
} as const

// Nerd Font file icons by extension
export const fileIcons: Record<string, string> = {
  ts: '\ue628',
  tsx: '\ue628',
  js: '\ue781',
  jsx: '\ue781',
  mjs: '\ue718',
  cjs: '\ue718',
  json: '\ue60b',
  vue: '\ue6a0',
  css: '\ue749',
  scss: '\ue749',
  sass: '\ue749',
  html: '\ue736',
  md: '\ue73e',
  default: '\uf15b',
}

export type SymbolKey = keyof typeof symbols
