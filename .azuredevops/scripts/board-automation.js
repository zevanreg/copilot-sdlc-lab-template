const {
  LAB_TAG, createClient, hasTag, required, sameTags, tagsOf
} = require('./azure-devops')

const managedPrefixes = ['area:', 'complexity:', 'priority:', 'kind:']
const approvalTags = ['ready-for-building', 'develop-with-ai', 'ready-for-qa', 'release-to-production', 'released']

function hasAny(text, words) {
  return words.some((word) => text.includes(word))
}

function hasAnyKeyword(text, words) {
  return words.some((word) => {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`\\b${escaped}\\b`).test(text)
  })
}

function plainText(value = '') {
  return value
    .replace(/<li(?:\s[^>]*)?>/gi, '\n- [ ] ')
    .replace(/<br\s*\/?>|<\/(?:p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
}

function classifyWorkItem(title, body = '', criteriaCount = (body.match(/- \[[ xX]\]/g) || []).length) {
  const text = `${title}\n${body}`.toLowerCase()
  const frontend = hasAny(text, [
    'react', 'frontend', 'front-end', 'browser', 'page', 'screen', 'button', 'form',
    'css', 'accessibility', 'responsive', 'ui ', 'ux '
  ])
  const backend = hasAny(text, [
    '.net', 'backend', 'back-end', 'api', 'endpoint', 'database', 'sqlite', 'entity framework',
    'booking rule', 'validation', 'server'
  ])
  const automation = hasAnyKeyword(text, [
    'workflow', 'automation', 'powershell', 'bash', 'script', 'cli', 'pipeline'
  ])
  const documentation = hasAny(text, ['documentation', 'readme', 'guide', 'instructions', 'runbook'])

  let area = 'area:backend'
  if (frontend && backend) area = 'area:full-stack'
  else if (automation) area = 'area:automation'
  else if (frontend) area = 'area:frontend'
  else if (documentation) area = 'area:documentation'

  let kind = 'kind:feature'
  if (hasAny(text, ['logging', 'log message', 'telemetry', 'diagnostic'])) kind = 'kind:logging'
  else if (automation) kind = 'kind:script'
  else if (hasAny(text, ['bug', 'broken', 'error', 'fails', 'incorrect', 'fix '])) kind = 'kind:bug'
  else if (documentation) kind = 'kind:docs'

  let priority = 'priority:p3'
  if (hasAny(text, ['critical', 'security', 'production down', 'blocker', 'data loss'])) {
    priority = 'priority:p1'
  } else if (kind === 'kind:bug' || hasAny(text, ['important', 'customer', 'regression'])) {
    priority = 'priority:p2'
  }

  let score = 0
  if (body.length > 600) score += 1
  if (body.length > 1400) score += 1
  if (area === 'area:full-stack') score += 2
  if (hasAny(text, ['database', 'migration', 'authentication', 'authorization', 'security'])) score += 1
  if (criteriaCount >= 4) score += 1

  const complexity = score >= 4
    ? 'complexity:high'
    : score >= 2
      ? 'complexity:medium'
      : 'complexity:low'
  return { area, kind, priority, complexity, score }
}

function classifyItem(item) {
  const fields = item.fields
  const criteria = plainText(fields['Microsoft.VSTS.Common.AcceptanceCriteria'] || '')
  const criteriaCount = criteria.split('\n').filter((line) => line.trim()).length
  const body = [
    fields['System.Description'],
    fields['Microsoft.VSTS.TCM.ReproSteps']
  ].filter(Boolean).map(plainText).join('\n')
  return classifyWorkItem(required(fields['System.Title'], 'Work item title'), `${body}\n${criteria}`, criteriaCount)
}

function chooseRoute(tags) {
  const includes = (tag) => hasTag(tags, tag)
  if (includes('area:full-stack') && includes('complexity:high')) {
    return {
      label: 'agent:vscode',
      customAgent: 'fullstack',
      reason: 'Cross-stack work benefits from interactive architecture decisions.'
    }
  }
  if (includes('area:frontend') && includes('complexity:low')) {
    return {
      label: 'agent:vscode',
      customAgent: 'frontend',
      reason: 'The bounded UI change is suitable for the frontend agent in VS Code.'
    }
  }
  if (includes('area:documentation') || includes('kind:docs')) {
    return {
      label: 'agent:vscode',
      customAgent: 'documentation',
      reason: 'Documentation work can use the documentation agent in VS Code.'
    }
  }
  if (includes('kind:script') || includes('area:automation')) {
    return {
      label: 'agent:copilot-cli',
      customAgent: '',
      reason: 'Command-line and pipeline work can be validated locally.'
    }
  }
  if (includes('kind:logging') || (includes('area:backend') && includes('complexity:low'))) {
    return {
      label: 'agent:vscode',
      customAgent: 'clean-code',
      reason: 'This bounded backend change has a short local validation loop.'
    }
  }
  return {
    label: 'agent:human',
    customAgent: '',
    reason: 'A maintainer decision is needed before choosing an implementation tool.'
  }
}

function rankWorkItem(item, now = Date.now()) {
  const tags = tagsOf(item)
  const priority = hasTag(tags, 'priority:p1') ? 300 : hasTag(tags, 'priority:p2') ? 200 : 100
  const complexity = hasTag(tags, 'complexity:high') ? 30 : hasTag(tags, 'complexity:medium') ? 20 : 10
  const created = Date.parse(required(item.fields['System.CreatedDate'], 'Work item creation date'))
  if (!Number.isFinite(created)) throw new Error(`Work item ${item.id} has an invalid creation date.`)
  const ageInDays = Math.max(0, Math.min(30, Math.floor((now - created) / 86_400_000)))
  return priority + complexity + ageInDays
}

function selectRoutes(items, now = Date.now()) {
  const candidates = items.filter((item) => {
    const tags = tagsOf(item)
    return hasTag(tags, LAB_TAG)
      && hasTag(tags, 'status:triaged')
      && hasTag(tags, 'ready-for-building')
      && !hasTag(tags, 'ready-for-qa')
      && !hasTag(tags, 'released')
  })
  candidates.sort((left, right) =>
    rankWorkItem(right, now) - rankWorkItem(left, now)
      || Date.parse(left.fields['System.CreatedDate']) - Date.parse(right.fields['System.CreatedDate'])
      || left.id - right.id)

  const selected = new Map()
  for (const item of candidates) {
    const route = chooseRoute(tagsOf(item))
    const lane = `${route.label}:${route.customAgent}`
    if (!selected.has(lane)) selected.set(lane, { item, route, score: rankWorkItem(item, now) })
  }
  return [...selected.values()]
}

async function triageItems(client, items, log = console.log) {
  for (const item of items) {
    const tags = tagsOf(item)
    if (!hasTag(tags, LAB_TAG) || hasTag(tags, 'status:triaged')) continue
    if (approvalTags.some((tag) => hasTag(tags, tag))) {
      throw new Error(`Work item ${item.id} has approval tags but is not triaged. Remove the approvals before re-triage.`)
    }
    const result = classifyItem(item)
    const preserved = tags.filter((tag) =>
      tag !== 'status:new'
        && !tag.startsWith('agent:')
        && !managedPrefixes.some((prefix) => tag.startsWith(prefix)))
    const next = [...preserved, result.area, result.kind, result.priority, result.complexity, 'status:triaged']
    const history = `<p><b>Automated triage:</b> ${result.area}, ${result.kind}, ${result.priority}, ${result.complexity} (score ${result.score}).</p><p>A human must approve scope with ready-for-building before routing.</p>`
    await client.updateWorkItem(item, next, history)
    log(`Triaged work item ${item.id}: ${result.complexity}.`)
  }
}

async function routeItems(client, items, log = console.log, now = Date.now()) {
  const selected = selectRoutes(items, now)
  for (const { item, route, score } of selected) {
    const current = tagsOf(item)
    const next = [...current.filter((tag) => !tag.startsWith('agent:')), route.label]
    if (!sameTags(current, next)) {
      const role = route.customAgent || 'human-led'
      const history = `<p><b>Daily router:</b> ${route.label}; role: ${role}; score: ${score}.</p><p>${route.reason} A human must add develop-with-ai before starting AI-assisted work.</p>`
      await client.updateWorkItem(item, next, history)
    }
    log(`Selected work item ${item.id}: ${route.label}, ${route.customAgent || 'human-led'}, score ${score}.`)
  }
  if (selected.length === 0) log('No approved work items are ready for routing.')
}

async function runBoardAutomation(client, action, log = console.log) {
  if (!['all', 'triage', 'route'].includes(action)) {
    throw new Error(`Unsupported board action: ${action}.`)
  }
  if (action === 'all' || action === 'triage') {
    await triageItems(client, await client.listLabWorkItems(), log)
  }
  if (action === 'all' || action === 'route') {
    await routeItems(client, await client.listLabWorkItems(), log)
  }
}

async function main(env = process.env) {
  if (env.BUILD_SOURCEBRANCH !== 'refs/heads/main') {
    throw new Error('Board automation must run from the protected main branch.')
  }
  const client = createClient({
    collectionUri: env.SYSTEM_COLLECTIONURI,
    project: env.SYSTEM_TEAMPROJECT,
    token: env.ADO_AUTOMATION_TOKEN
  })
  await runBoardAutomation(client, required(env.BOARD_ACTION, 'BOARD_ACTION'))
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}

module.exports = {
  chooseRoute,
  classifyItem,
  classifyWorkItem,
  plainText,
  rankWorkItem,
  routeItems,
  runBoardAutomation,
  selectRoutes,
  triageItems
}
