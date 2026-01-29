import { test } from '@japa/runner'
import { ProfileCollector } from '../src/profiler/collector.js'
import type { ModuleTiming } from '../src/types.js'

function createModule(
  url: string,
  loadTime: number,
  parentUrl?: string,
  subtreeTime?: number
): ModuleTiming {
  return {
    specifier: url.split('/').pop() || url,
    resolvedUrl: url,
    loadTime,
    parentUrl,
    subtreeTime,
  }
}

test.group('ProfileCollector - Subtree Time Computation', () => {
  test('computes subtree times for a linear dependency chain', ({ assert }) => {
    const modules = [
      createModule('file:///app/a.ts', 10),
      createModule('file:///app/b.ts', 20, 'file:///app/a.ts'),
      createModule('file:///app/c.ts', 30, 'file:///app/b.ts'),
    ]

    const collector = new ProfileCollector(modules)
    const results = collector.collectResults(100)

    const moduleMap = new Map(results.modules.map((m) => [m.resolvedUrl, m]))

    assert.equal(moduleMap.get('file:///app/c.ts')?.subtreeTime, 30)
    assert.equal(moduleMap.get('file:///app/b.ts')?.subtreeTime, 50)
    assert.equal(moduleMap.get('file:///app/a.ts')?.subtreeTime, 60)
  })

  test('computes subtree times for a tree with multiple children', ({ assert }) => {
    const modules = [
      createModule('file:///app/root.ts', 5),
      createModule('file:///app/child1.ts', 10, 'file:///app/root.ts'),
      createModule('file:///app/child2.ts', 15, 'file:///app/root.ts'),
      createModule('file:///app/grandchild.ts', 20, 'file:///app/child1.ts'),
    ]

    const collector = new ProfileCollector(modules)
    const results = collector.collectResults(100)

    const moduleMap = new Map(results.modules.map((m) => [m.resolvedUrl, m]))

    assert.equal(moduleMap.get('file:///app/grandchild.ts')?.subtreeTime, 20)
    assert.equal(moduleMap.get('file:///app/child1.ts')?.subtreeTime, 30)
    assert.equal(moduleMap.get('file:///app/child2.ts')?.subtreeTime, 15)
    assert.equal(moduleMap.get('file:///app/root.ts')?.subtreeTime, 50)
  })

  test('handles circular references gracefully', ({ assert }) => {
    const modules = [
      createModule('file:///app/a.ts', 10, 'file:///app/b.ts'),
      createModule('file:///app/b.ts', 20, 'file:///app/a.ts'),
    ]

    const collector = new ProfileCollector(modules)
    const results = collector.collectResults(100)

    assert.isArray(results.modules)
    assert.lengthOf(results.modules, 2)
    results.modules.forEach((m) => {
      assert.isNumber(m.subtreeTime)
    })
  })

  test('skips subtree computation when already computed', ({ assert }) => {
    const modules = [
      createModule('file:///app/a.ts', 10, undefined, 100),
      createModule('file:///app/b.ts', 20, 'file:///app/a.ts', 50),
    ]

    const collector = new ProfileCollector(modules)
    const results = collector.collectResults(100)

    assert.equal(results.modules[0].subtreeTime, 100)
    assert.equal(results.modules[1].subtreeTime, 50)
  })
})

test.group('ProfileCollector - Package Grouping', () => {
  test('groups modules by package name', ({ assert }) => {
    const modules = [
      createModule('file:///app/node_modules/lodash/get.js', 10),
      createModule('file:///app/node_modules/lodash/set.js', 8),
      createModule('file:///app/node_modules/express/index.js', 30),
    ]

    const collector = new ProfileCollector(modules)
    const groups = collector.groupModulesByPackage()

    const lodashGroup = groups.find((g) => g.name === 'lodash')
    const expressGroup = groups.find((g) => g.name === 'express')

    assert.exists(lodashGroup)
    assert.exists(expressGroup)
    assert.lengthOf(lodashGroup!.modules, 2)
    assert.lengthOf(expressGroup!.modules, 1)
  })

  test('handles scoped packages', ({ assert }) => {
    const modules = [
      createModule('file:///app/node_modules/@adonisjs/core/index.js', 50),
      createModule('file:///app/node_modules/@adonisjs/core/http.js', 20),
      createModule('file:///app/node_modules/@poppinss/utils/index.js', 10),
    ]

    const collector = new ProfileCollector(modules)
    const groups = collector.groupModulesByPackage()

    const adonisGroup = groups.find((g) => g.name === '@adonisjs/core')
    const poppinsGroup = groups.find((g) => g.name === '@poppinss/utils')

    assert.exists(adonisGroup)
    assert.exists(poppinsGroup)
    assert.lengthOf(adonisGroup!.modules, 2)
    assert.equal(adonisGroup!.totalTime, 70)
  })

  test('puts app modules in app group', ({ assert }) => {
    const modules = [
      createModule('file:///app/src/service.ts', 15),
      createModule('file:///app/config/app.ts', 5),
    ]

    const collector = new ProfileCollector(modules)
    const groups = collector.groupModulesByPackage()

    const appGroup = groups.find((g) => g.name === 'app')
    assert.exists(appGroup)
    assert.lengthOf(appGroup!.modules, 2)
  })

  test('sorts packages by total time descending', ({ assert }) => {
    const modules = [
      createModule('file:///app/node_modules/fast-pkg/index.js', 5),
      createModule('file:///app/node_modules/slow-pkg/index.js', 100),
      createModule('file:///app/node_modules/medium-pkg/index.js', 50),
    ]

    const collector = new ProfileCollector(modules)
    const groups = collector.groupModulesByPackage()

    assert.equal(groups[0].name, 'slow-pkg')
    assert.equal(groups[1].name, 'medium-pkg')
    assert.equal(groups[2].name, 'fast-pkg')
  })
})

test.group('ProfileCollector - Summary', () => {
  test('computes complete summary', ({ assert }) => {
    const modules = [
      createModule('file:///app/src/app.ts', 10),
      createModule('file:///app/node_modules/pkg/index.js', 20),
      createModule('file:///app/node_modules/@adonisjs/core/index.js', 30),
      createModule('node:fs', 5),
    ]

    const providerPhases = new Map([
      ['AppProvider', { register: 5, boot: 10 }],
      ['DbProvider', { register: 3, boot: 20 }],
    ])

    const collector = new ProfileCollector(modules, providerPhases)
    const summary = collector.computeSummary()

    assert.equal(summary.totalModules, 4)
    assert.equal(summary.userModules, 1)
    assert.equal(summary.nodeModules, 1)
    assert.equal(summary.adonisModules, 1)
    assert.equal(summary.totalProviderTime, 38)
  })

  test('handles empty modules array', ({ assert }) => {
    const collector = new ProfileCollector()
    const summary = collector.computeSummary()

    assert.equal(summary.totalModules, 0)
    assert.equal(summary.userModules, 0)
    assert.isArray(summary.appFileGroups)
  })
})
