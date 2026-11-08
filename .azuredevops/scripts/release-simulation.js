const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const {
  LAB_TAG, createClient, hasTag, required, tagsOf, workItemId
} = require('./azure-devops')

function currentCommit() {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
}

function isAncestor(commit) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', commit, 'HEAD'], { stdio: 'pipe' })
    return true
  } catch (error) {
    if (error.status === 1) return false
    throw error
  }
}

function releaseContext(env, readHead = currentCommit) {
  if (env.BUILD_SOURCEBRANCH !== 'refs/heads/main') {
    throw new Error('Release simulation must run from the protected main branch.')
  }
  const id = workItemId(env.WORK_ITEM_ID)
  const commit = required(env.BUILD_SOURCEVERSION, 'BUILD_SOURCEVERSION').toLowerCase()
  if (!/^[a-f0-9]{40}$/.test(commit) || readHead().toLowerCase() !== commit) {
    throw new Error('The checkout does not match the main-branch pipeline commit.')
  }
  return {
    id,
    commit,
    repository: required(env.BUILD_REPOSITORY_NAME, 'BUILD_REPOSITORY_NAME'),
    run: workItemId(env.BUILD_BUILDID)
  }
}

function linkedPullRequestIds(item, projectId, repositoryId) {
  const prefix = 'vstfs:///Git/PullRequestId/'
  const ids = []
  for (const relation of item.relations || []) {
    if (relation.rel !== 'ArtifactLink' || !relation.url?.startsWith(prefix)) continue
    const parts = decodeURIComponent(relation.url.slice(prefix.length)).split('/')
    if (parts.length !== 3) throw new Error(`Work item ${item.id} has an invalid pull request link.`)
    if (parts[0].toLowerCase() === projectId.toLowerCase()
        && parts[1].toLowerCase() === repositoryId.toLowerCase()) {
      ids.push(workItemId(parts[2]))
    }
  }
  return [...new Set(ids)]
}

async function verifyRelease(client, env, { readHead = currentCommit, containsCommit = isAncestor } = {}) {
  const context = releaseContext(env, readHead)
  const projectId = required(env.SYSTEM_TEAMPROJECTID, 'SYSTEM_TEAMPROJECTID')
  const repositoryId = required(env.BUILD_REPOSITORY_ID, 'BUILD_REPOSITORY_ID')
  if (await client.getMainCommit(repositoryId) !== context.commit) {
    throw new Error('The pipeline commit is not the current main branch tip. Queue a new run on main.')
  }
  const item = await client.getWorkItem(context.id)
  if (item.id !== context.id || !['User Story', 'Bug'].includes(item.fields['System.WorkItemType'])) {
    throw new Error(`Work item ${context.id} must be an Agile User Story or Bug.`)
  }
  const tags = tagsOf(item)
  for (const tag of [LAB_TAG, 'status:triaged', 'ready-for-building', 'ready-for-qa', 'release-to-production']) {
    if (!hasTag(tags, tag)) throw new Error(`Work item ${context.id} is missing the ${tag} tag.`)
  }
  if (hasTag(tags, 'released')) {
    throw new Error(`Work item ${context.id} is already released. A new release requires fresh approval.`)
  }

  const ids = linkedPullRequestIds(item, projectId, repositoryId)
  for (const id of ids) {
    const pr = await client.getPullRequest(repositoryId, id)
    const reviewers = pr.reviewers || []
    const approved = !reviewers.some((reviewer) => reviewer.vote < 0)
      && reviewers.some((reviewer) =>
        !reviewer.isContainer
          && typeof reviewer.id === 'string'
          && reviewer.id.length > 0
          && typeof pr.createdBy?.id === 'string'
          && pr.createdBy.id.length > 0
          && reviewer.id !== pr.createdBy.id
          && reviewer.vote >= 5)
    const mergeCommit = pr.lastMergeCommit?.commitId?.toLowerCase()
    if (pr.status === 'completed'
        && pr.targetRefName === 'refs/heads/main'
        && approved
        && /^[a-f0-9]{40}$/.test(mergeCommit || '')
        && containsCommit(mergeCommit)) {
      return { context, item, pullRequestId: id }
    }
  }
  throw new Error(`Work item ${context.id} needs a linked, independently approved PR completed into this main commit.`)
}

function createArtifact(env, {
  readHead = currentCommit,
  distDirectory = path.join('src', 'hotel-booking-web', 'dist'),
  outputDirectory = 'release',
  now = () => new Date()
} = {}) {
  const context = releaseContext(env, readHead)
  const manifest = {
    repository: context.repository,
    commit: context.commit,
    workItem: context.id,
    pipelineRun: context.run,
    releasedAt: now().toISOString(),
    environment: 'simulation'
  }
  fs.mkdirSync(outputDirectory, { recursive: true })
  fs.cpSync(distDirectory, path.join(outputDirectory, 'web'), {
    recursive: true,
    force: false,
    errorOnExist: true
  })
  fs.writeFileSync(path.join(outputDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, {
    flag: 'wx'
  })
  return manifest
}

async function completeRelease(client, env, options = {}) {
  const { context, item, pullRequestId } = await verifyRelease(client, env, options)
  const collection = required(env.SYSTEM_COLLECTIONURI, 'SYSTEM_COLLECTIONURI').replace(/\/?$/, '/')
  const project = encodeURIComponent(required(env.SYSTEM_TEAMPROJECT, 'SYSTEM_TEAMPROJECT'))
  const runUrl = `${collection}${project}/_build/results?buildId=${context.run}`
  const history = `<p>Release simulation passed for PR ${pullRequestId} and produced an artifact: <a href="${runUrl}">pipeline run ${context.run}</a>.</p>`
  await client.updateWorkItem(item, [...tagsOf(item), 'released'], history)
  return { ...context, pullRequestId }
}

async function main(env = process.env) {
  const action = required(env.RELEASE_ACTION, 'RELEASE_ACTION')
  if (action === 'artifact') {
    createArtifact(env)
    console.log('Created simulated release manifest and web assets.')
    return
  }
  if (!['verify', 'complete'].includes(action)) throw new Error(`Unsupported release action: ${action}.`)
  const client = createClient({
    collectionUri: env.SYSTEM_COLLECTIONURI,
    project: env.SYSTEM_TEAMPROJECT,
    token: env.ADO_AUTOMATION_TOKEN
  })
  const result = action === 'verify'
    ? await verifyRelease(client, env)
    : await completeRelease(client, env)
  console.log(`Release ${action} passed for work item ${result.context?.id || result.id} and PR ${result.pullRequestId}.`)
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}

module.exports = {
  completeRelease,
  createArtifact,
  linkedPullRequestIds,
  releaseContext,
  verifyRelease
}
