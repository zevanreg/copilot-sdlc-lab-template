const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')
const { createClient } = require('./azure-devops')
const {
  chooseRoute, classifyItem, classifyWorkItem, rankWorkItem, routeItems,
  runBoardAutomation, selectRoutes, triageItems
} = require('./board-automation')
const {
  completeRelease, createArtifact, linkedPullRequestIds, releaseContext, verifyRelease
} = require('./release-simulation')

const now = Date.parse('2030-01-31T12:00:00Z')
const commit = 'a'.repeat(40)
const mergeCommit = 'b'.repeat(40)

function item(id, tags, fields = {}) {
  return {
    id,
    rev: 1,
    fields: {
      'System.Title': 'Add a React page',
      'System.State': 'New',
      'System.WorkItemType': 'User Story',
      'System.CreatedDate': '2030-01-30T12:00:00Z',
      'System.Tags': tags.join('; '),
      ...fields
    }
  }
}

function memoryClient(items, pullRequests = {}) {
  const updates = []
  return {
    updates,
    mainCommit: commit,
    async listLabWorkItems() {
      return structuredClone(items)
    },
    async getWorkItem(id) {
      const found = items.find((value) => value.id === id)
      if (!found) throw new Error(`Unknown work item ${id}.`)
      return structuredClone(found)
    },
    async getPullRequest(repositoryId, id) {
      const found = pullRequests[id]
      if (!found) throw new Error(`Unknown pull request ${id}.`)
      return structuredClone(found)
    },
    async getMainCommit() {
      return this.mainCommit
    },
    async updateWorkItem(current, tags, history) {
      const found = items.find((value) => value.id === current.id)
      if (found.rev !== current.rev) throw new Error('Revision conflict.')
      updates.push({ id: current.id, tags, history, rev: current.rev })
      found.fields['System.Tags'] = tags.join('; ')
      found.rev += 1
      return structuredClone(found)
    }
  }
}

function releaseFixture() {
  const env = {
    BUILD_SOURCEBRANCH: 'refs/heads/main',
    BUILD_SOURCEVERSION: commit,
    BUILD_REPOSITORY_NAME: 'northstar',
    BUILD_REPOSITORY_ID: 'repository-id',
    BUILD_BUILDID: '81',
    WORK_ITEM_ID: '42',
    SYSTEM_COLLECTIONURI: 'https://dev.azure.com/example/',
    SYSTEM_TEAMPROJECT: 'Lab Project',
    SYSTEM_TEAMPROJECTID: 'project-id'
  }
  const work = item(42, [
    'ai-sdlc-lab', 'status:triaged', 'ready-for-building', 'ready-for-qa',
    'release-to-production', 'attendee-tag'
  ])
  work.relations = [{
    rel: 'ArtifactLink',
    url: 'vstfs:///Git/PullRequestId/project-id%2Frepository-id%2F17'
  }]
  const pr = {
    status: 'completed',
    targetRefName: 'refs/heads/main',
    createdBy: { id: 'author' },
    reviewers: [{ id: 'reviewer', vote: 10 }],
    lastMergeCommit: { commitId: mergeCommit }
  }
  const options = { readHead: () => commit, containsCommit: (value) => value === mergeCommit }
  return { env, work, pr, options }
}

test('classifies Azure Boards rich text and acceptance criteria as high-complexity cross-stack work', () => {
  const work = item(1, ['ai-sdlc-lab'], {
    'System.Title': 'Amend booking dates',
    'System.Description': '<div>Update the React page, .NET API and database.</div>',
    'Microsoft.VSTS.Common.AcceptanceCriteria': '<ul><li>Edit dates</li><li>Reject conflicts</li><li>Save</li><li>Show validation</li></ul>'
  })
  const result = classifyItem(work)
  assert.equal(result.area, 'area:full-stack')
  assert.equal(result.complexity, 'complexity:high')
  assert.equal(result.score, 4)
})

test('does not classify description as a script', () => {
  const result = classifyWorkItem(
    'Add hotel highlights to the home page',
    'The page needs a hotel description, customer reviews, awards, and more visual detail.'
  )
  assert.equal(result.area, 'area:frontend')
  assert.equal(result.kind, 'kind:feature')
})

test('counts acceptance-criteria lines without counting unrelated description lists', () => {
  const work = item(1, ['ai-sdlc-lab'], {
    'System.Description': '<ul><li>One</li><li>Two</li><li>Three</li><li>Four</li></ul>',
    'Microsoft.VSTS.Common.AcceptanceCriteria': 'One criterion'
  })
  assert.equal(classifyItem(work).score, 0)
  work.fields['Microsoft.VSTS.Common.AcceptanceCriteria'] = 'One\nTwo\nThree\nFour'
  assert.equal(classifyItem(work).score, 1)
})

test('routes only to supported local Copilot or human surfaces', () => {
  assert.deepEqual(
    [chooseRoute(['area:full-stack', 'complexity:high']).label,
      chooseRoute(['area:full-stack', 'complexity:high']).customAgent],
    ['agent:vscode', 'fullstack']
  )
  assert.equal(chooseRoute(['area:frontend', 'complexity:low']).customAgent, 'frontend')
  assert.equal(chooseRoute(['area:documentation', 'kind:docs']).customAgent, 'documentation')
  assert.equal(chooseRoute(['area:backend', 'kind:logging']).customAgent, 'clean-code')
  assert.equal(chooseRoute(['area:automation', 'kind:script']).label, 'agent:copilot-cli')
  assert.equal(chooseRoute(['area:backend', 'complexity:high']).label, 'agent:human')
})

test('ranks priority before complexity and caps the age adjustment', () => {
  const urgent = item(1, ['priority:p1', 'complexity:low'])
  const normal = item(2, ['priority:p3', 'complexity:high'], {
    'System.CreatedDate': '2029-01-01T00:00:00Z'
  })
  assert.ok(rankWorkItem(urgent, now) > rankWorkItem(normal, now))
  assert.equal(rankWorkItem(normal, now), 160)
})

test('selects one highest-ranked work item per tool and custom-agent lane, honoring gates', () => {
  const ready = ['ai-sdlc-lab', 'status:triaged', 'ready-for-building']
  const items = [
    item(1, [...ready, 'area:frontend', 'complexity:low', 'priority:p3']),
    item(2, [...ready, 'area:frontend', 'complexity:low', 'priority:p1']),
    item(3, [...ready, 'area:documentation', 'kind:docs', 'priority:p3']),
    item(4, [...ready, 'area:automation', 'kind:script', 'priority:p3']),
    item(5, ['ai-sdlc-lab', 'status:triaged', 'area:frontend', 'complexity:low', 'priority:p1']),
    item(6, [...ready, 'area:frontend', 'complexity:low', 'ready-for-qa']),
    item(7, [...ready, 'area:frontend', 'complexity:low', 'released']),
    item(8, ['ai-sdlc-lab-other', 'status:triaged', 'ready-for-building', 'area:frontend', 'complexity:low'])
  ]
  assert.deepEqual(selectRoutes(items, now).map(({ item: selected }) => selected.id), [2, 3, 4])
})

test('triage preserves unrelated tags, clears a stale route, and is idempotent', async () => {
  const work = item(1, [
    'ai-sdlc-lab', 'status:new', 'attendee-tag', 'Attendee-tag',
    'Area:backend', 'area:backend', 'agent:vscode'
  ])
  const client = memoryClient([work])
  await triageItems(client, [structuredClone(work)], () => {})
  assert.equal(client.updates.length, 1)
  assert.ok(client.updates[0].tags.includes('attendee-tag'))
  assert.ok(client.updates[0].tags.includes('Attendee-tag'))
  assert.ok(client.updates[0].tags.includes('Area:backend'))
  assert.ok(client.updates[0].tags.includes('area:frontend'))
  assert.ok(client.updates[0].tags.includes('status:triaged'))
  assert.ok(!client.updates[0].tags.includes('status:new'))
  assert.ok(!client.updates[0].tags.includes('area:backend'))
  assert.ok(!client.updates[0].tags.includes('agent:vscode'))
  assert.match(client.updates[0].history, /Automated triage/)
  await triageItems(client, [structuredClone(work)], () => {})
  assert.equal(client.updates.length, 1)
})

test('work item scope and approval tags are case-sensitive', () => {
  const differentlyCasedLab = item(1, ['AI-SDLC-LAB', 'status:triaged', 'ready-for-building'])
  const differentlyCasedApproval = item(2, ['ai-sdlc-lab', 'status:triaged', 'Ready-For-Building'])
  assert.deepEqual(selectRoutes([differentlyCasedLab, differentlyCasedApproval], now), [])
})

test('requires approvals to be removed before re-triaging changed scope', async () => {
  const work = item(1, ['ai-sdlc-lab', 'ready-for-building'])
  const client = memoryClient([work])
  await assert.rejects(triageItems(client, [work], () => {}), /Remove the approvals/)
  assert.equal(client.updates.length, 0)
})

test('routing never grants approval or starts an agent and does not duplicate its update', async () => {
  const work = item(1, [
    'ai-sdlc-lab', 'status:triaged', 'ready-for-building',
    'area:frontend', 'complexity:low', 'agent:human', 'attendee-tag'
  ])
  const client = memoryClient([work])
  await routeItems(client, [structuredClone(work)], () => {}, now)
  assert.ok(client.updates[0].tags.includes('agent:vscode'))
  assert.ok(!client.updates[0].tags.includes('agent:human'))
  assert.ok(!client.updates[0].tags.includes('develop-with-ai'))
  assert.ok(client.updates[0].tags.includes('attendee-tag'))
  assert.match(client.updates[0].history, /frontend/)
  await routeItems(client, [structuredClone(work)], () => {}, now)
  assert.equal(client.updates.length, 1)
})

test('all action re-reads work items after triage before routing', async () => {
  const work = item(1, ['ai-sdlc-lab', 'status:new'])
  const client = memoryClient([work])
  await runBoardAutomation(client, 'all', () => {})
  assert.equal(client.updates.length, 1)
  assert.ok(work.fields['System.Tags'].includes('status:triaged'))
  assert.ok(!work.fields['System.Tags'].includes('agent:'))
  await assert.rejects(runBoardAutomation(client, 'unknown', () => {}), /Unsupported board action/)
})

test('Azure DevOps client scopes WIQL to lab items and writes with a revision test', async () => {
  const calls = []
  const lab = item(1, ['ai-sdlc-lab'])
  const other = item(2, ['ai-sdlc-lab-other'])
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options })
    const body = url.pathname.endsWith('/wiql')
      ? { workItems: [{ id: 1 }, { id: 2 }] }
      : url.pathname.endsWith('/workitemsbatch')
        ? { value: [lab, other] }
        : { id: 1 }
    return { ok: true, json: async () => body }
  }
  const client = createClient({
    collectionUri: 'https://dev.azure.com/example/',
    project: 'Lab Project',
    token: 'test-token',
    fetchImpl
  })
  const items = await client.listLabWorkItems()
  assert.deepEqual(items.map((value) => value.id), [1])
  assert.match(calls[0].url, /example\/Lab%20Project\/_apis\/wit\/wiql/)
  assert.match(JSON.parse(calls[0].options.body).query, /System\.Tags.*ai-sdlc-lab/)
  await client.updateWorkItem(items[0], ['ai-sdlc-lab', 'status:triaged'], 'triaged')
  const patch = JSON.parse(calls[2].options.body)
  assert.deepEqual(patch[0], { op: 'test', path: '/rev', value: 1 })
  assert.equal(patch[1].value, 'ai-sdlc-lab; status:triaged')
  assert.equal(calls[2].options.headers['content-type'], 'application/json-patch+json')
})

test('Azure DevOps client batches more than 200 work items', async () => {
  const batchSizes = []
  const fetchImpl = async (url, options) => {
    if (url.pathname.endsWith('/wiql')) {
      return { ok: true, json: async () => ({ workItems: Array.from({ length: 201 }, (_, index) => ({ id: index + 1 })) }) }
    }
    const ids = JSON.parse(options.body).ids
    batchSizes.push(ids.length)
    return { ok: true, json: async () => ({ value: ids.map((id) => item(id, ['ai-sdlc-lab'])) }) }
  }
  const client = createClient({
    collectionUri: 'https://dev.azure.com/example/',
    project: 'Lab',
    token: 'test-token',
    fetchImpl
  })
  assert.equal((await client.listLabWorkItems()).length, 201)
  assert.deepEqual(batchSizes, [200, 1])
})

test('Azure DevOps client fails rather than silently dropping work items from a batch', async () => {
  const client = createClient({
    collectionUri: 'https://dev.azure.com/example/',
    project: 'Lab',
    token: 'test-token',
    fetchImpl: async (url) => ({
      ok: true,
      json: async () => url.pathname.endsWith('/wiql')
        ? { workItems: [{ id: 1 }, { id: 2 }] }
        : { value: [item(1, ['ai-sdlc-lab'])] }
    })
  })
  await assert.rejects(client.listLabWorkItems(), /incomplete work item batch/)
})

test('Azure DevOps client selects the exact main ref rather than a prefix match', async () => {
  const client = createClient({
    collectionUri: 'https://dev.azure.com/example/',
    project: 'Lab',
    token: 'test-token',
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        value: [
          { name: 'refs/heads/main-backup', objectId: mergeCommit },
          { name: 'refs/heads/main', objectId: commit }
        ]
      })
    })
  })
  assert.equal(await client.getMainCommit('repository-id'), commit)
})

test('Azure DevOps client surfaces permission errors and refuses non-DevOps credential destinations', async () => {
  assert.throws(() => createClient({
    collectionUri: 'https://example.invalid/',
    project: 'Lab',
    token: 'test-token'
  }), /Azure DevOps Services HTTPS URL/)
  const client = createClient({
    collectionUri: 'https://dev.azure.com/example/',
    project: 'Lab',
    token: 'test-token',
    fetchImpl: async () => ({ ok: false, status: 403 })
  })
  await assert.rejects(client.getWorkItem(1), /HTTP 403/)
})

test('verifies a linked approved PR merged into the checked-out main commit', async () => {
  const { env, work, pr, options } = releaseFixture()
  const client = memoryClient([work], { 17: pr })
  const result = await verifyRelease(client, env, options)
  assert.equal(result.context.id, 42)
  assert.equal(result.pullRequestId, 17)
  assert.deepEqual(linkedPullRequestIds(work, 'project-id', 'repository-id'), [17])
})

test('release verification rejects missing approval, wrong PRs, and unmerged code', async (t) => {
  const cases = [
    ['missing QA approval', ({ work }) => { work.fields['System.Tags'] = 'ai-sdlc-lab; status:triaged; ready-for-building; release-to-production' }],
    ['missing release approval', ({ work }) => { work.fields['System.Tags'] = 'ai-sdlc-lab; status:triaged; ready-for-building; ready-for-qa' }],
    ['missing lab scope', ({ work }) => { work.fields['System.Tags'] = 'status:triaged; ready-for-building; ready-for-qa; release-to-production' }],
    ['missing triage', ({ work }) => { work.fields['System.Tags'] = 'ai-sdlc-lab; ready-for-building; ready-for-qa; release-to-production' }],
    ['missing scope approval', ({ work }) => { work.fields['System.Tags'] = 'ai-sdlc-lab; status:triaged; ready-for-qa; release-to-production' }],
    ['already released', ({ work }) => { work.fields['System.Tags'] += '; released' }],
    ['stale main commit', (fixture) => { fixture.env.BUILD_SOURCEVERSION = 'c'.repeat(40); fixture.options.readHead = () => 'c'.repeat(40) }],
    ['wrong work item type', ({ work }) => { work.fields['System.WorkItemType'] = 'Task' }],
    ['unlinked PR', ({ work }) => { work.relations = [] }],
    ['different repository', ({ env }) => { env.BUILD_REPOSITORY_ID = 'other-repository' }],
    ['active PR', ({ pr }) => { pr.status = 'active' }],
    ['wrong target branch', ({ pr }) => { pr.targetRefName = 'refs/heads/other' }],
    ['no independent approval', ({ pr }) => { pr.reviewers = [{ id: 'reviewer', vote: 0 }] }],
    ['unresolved rejection', ({ pr }) => { pr.reviewers.push({ id: 'another-reviewer', vote: -10 }) }],
    ['waiting for author', ({ pr }) => { pr.reviewers.push({ id: 'another-reviewer', vote: -5 }) }],
    ['self approval only', ({ pr }) => { pr.reviewers = [{ id: 'author', vote: 10 }] }],
    ['missing reviewer identity', ({ pr }) => { pr.reviewers = [{ vote: 10 }] }],
    ['missing author identity', ({ pr }) => { pr.createdBy = {} }],
    ['group approval only', ({ pr }) => { pr.reviewers = [{ id: 'group', vote: 10, isContainer: true }] }],
    ['commit not in main', (fixture) => { fixture.options.containsCommit = () => false }]
  ]
  for (const [name, mutate] of cases) {
    await t.test(name, async () => {
      const fixture = releaseFixture()
      mutate(fixture)
      const client = memoryClient([fixture.work], { 17: fixture.pr })
      await assert.rejects(verifyRelease(client, fixture.env, fixture.options))
      assert.equal(client.updates.length, 0)
    })
  }
})

test('rejects invalid IDs, non-main branches, and a mismatched checkout', () => {
  const { env, options } = releaseFixture()
  assert.throws(() => releaseContext({ ...env, WORK_ITEM_ID: '42; echo bad' }, options.readHead), /positive numeric/)
  assert.throws(() => releaseContext({ ...env, BUILD_SOURCEBRANCH: 'refs/heads/feature' }, options.readHead), /main branch/)
  assert.throws(() => releaseContext(env, () => 'c'.repeat(40)), /does not match/)
})

test('completion rechecks the gates and only then adds released with run evidence', async () => {
  const { env, work, pr, options } = releaseFixture()
  const client = memoryClient([work], { 17: pr })
  await verifyRelease(client, env, options)
  work.fields['System.Tags'] = 'ai-sdlc-lab; status:triaged; ready-for-building; ready-for-qa'
  await assert.rejects(completeRelease(client, env, options), /release-to-production/)
  assert.equal(client.updates.length, 0)
  work.fields['System.Tags'] += '; release-to-production'
  client.mainCommit = 'c'.repeat(40)
  await assert.rejects(completeRelease(client, env, options), /current main branch tip/)
  assert.equal(client.updates.length, 0)
  client.mainCommit = commit
  const result = await completeRelease(client, env, options)
  assert.equal(result.pullRequestId, 17)
  assert.ok(client.updates[0].tags.includes('released'))
  assert.match(client.updates[0].history, /buildId=81/)
  assert.equal(client.updates[0].rev, 1)
})

test('a work item follows the human-gated path from triage through release', async () => {
  const { env, work, pr, options } = releaseFixture()
  work.fields['System.Tags'] = 'ai-sdlc-lab'
  const client = memoryClient([work], { 17: pr })
  await runBoardAutomation(client, 'all', () => {})
  assert.match(work.fields['System.Tags'], /status:triaged/)
  assert.doesNotMatch(work.fields['System.Tags'], /agent:/)

  work.fields['System.Tags'] += '; ready-for-building'
  work.rev += 1
  await runBoardAutomation(client, 'route', () => {})
  assert.match(work.fields['System.Tags'], /agent:vscode/)
  assert.doesNotMatch(work.fields['System.Tags'], /develop-with-ai/)

  work.fields['System.Tags'] += '; develop-with-ai; ready-for-qa; release-to-production'
  work.rev += 1
  await completeRelease(client, env, options)
  assert.match(work.fields['System.Tags'], /released/)
  assert.equal(work.fields['System.State'], 'New')
})

test('release gate checks actual Git ancestry for the selected main commit', (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'northstar-git-test-'))
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  const noHooks = path.join(temporary, 'no-hooks')
  fs.mkdirSync(noHooks)
  const git = (...args) => execFileSync('git', ['-C', temporary, ...args], { encoding: 'utf8' }).trim()
  const commitEmpty = (message) => git(
    '-c', 'user.name=Automation Test', '-c', 'user.email=automation@example.invalid',
    '-c', 'commit.gpgsign=false', '-c', `core.hooksPath=${noHooks}`,
    'commit', '--allow-empty', '-m',
    `${message}\n\nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`
  )
  git('init', '-q', '-b', 'main')
  commitEmpty('base')
  const base = git('rev-parse', 'HEAD')
  git('switch', '-q', '-c', 'other')
  commitEmpty('other')
  const other = git('rev-parse', 'HEAD')
  git('switch', '-q', 'main')
  commitEmpty('main')
  const main = git('rev-parse', 'HEAD')

  const { env, work, pr } = releaseFixture()
  env.BUILD_SOURCEVERSION = main
  const modulePath = path.join(__dirname, 'release-simulation.js')
  const run = (merge) => {
    pr.lastMergeCommit.commitId = merge
    const script = `
      const { verifyRelease } = require(${JSON.stringify(modulePath)})
      const client = {
        getWorkItem: async () => (${JSON.stringify(work)}),
        getPullRequest: async () => (${JSON.stringify(pr)}),
        getMainCommit: async () => ${JSON.stringify(main)}
      }
      verifyRelease(client, ${JSON.stringify(env)}).catch((error) => {
        console.error(error.message)
        process.exitCode = 1
      })
    `
    return spawnSync(process.execPath, ['-e', script], { cwd: temporary, encoding: 'utf8' })
  }
  const accepted = run(base)
  assert.ifError(accepted.error)
  assert.equal(accepted.status, 0, accepted.stderr)
  const rejected = run(other)
  assert.ifError(rejected.error)
  assert.equal(rejected.status, 1)
  assert.match(rejected.stderr, /independently approved PR/)
})

test('creates a simulation manifest and copies the built web assets without credentials', (t) => {
  const { env, options } = releaseFixture()
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'northstar-release-test-'))
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  const dist = path.join(temporary, 'dist')
  const output = path.join(temporary, 'release')
  fs.mkdirSync(dist)
  fs.writeFileSync(path.join(dist, 'index.html'), 'built')
  const manifest = createArtifact(env, {
    ...options,
    distDirectory: dist,
    outputDirectory: output,
    now: () => new Date('2030-01-31T12:00:00Z')
  })
  assert.deepEqual(manifest, {
    repository: 'northstar',
    commit,
    workItem: 42,
    pipelineRun: 81,
    releasedAt: '2030-01-31T12:00:00.000Z',
    environment: 'simulation'
  })
  assert.equal(fs.readFileSync(path.join(output, 'web', 'index.html'), 'utf8'), 'built')
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(output, 'manifest.json'), 'utf8')), manifest)
})
