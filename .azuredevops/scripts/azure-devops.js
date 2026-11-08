const LAB_TAG = 'ai-sdlc-lab'

function required(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} is required.`)
  }
  return value.trim()
}

function workItemId(value) {
  const text = String(value ?? '')
  const id = Number(text)
  if (!/^[1-9]\d*$/.test(text) || !Number.isSafeInteger(id)) {
    throw new Error('A positive numeric work item ID is required.')
  }
  return id
}

function tagsOf(item) {
  return (item.fields['System.Tags'] || '')
    .split(';')
    .map((tag) => tag.trim())
    .filter(Boolean)
}

function hasTag(tags, name) {
  return tags.includes(name)
}

function uniqueTags(tags) {
  return [...new Set(tags)]
}

function sameTags(left, right) {
  const a = uniqueTags(left).sort()
  const b = uniqueTags(right).sort()
  return a.length === b.length && a.every((tag, index) => tag === b[index])
}

function createClient({ collectionUri, project, token, fetchImpl = fetch }) {
  const collection = new URL(required(collectionUri, 'SYSTEM_COLLECTIONURI'))
  if (collection.protocol !== 'https:'
      || (collection.hostname !== 'dev.azure.com'
        && !collection.hostname.endsWith('.visualstudio.com'))) {
    throw new Error('SYSTEM_COLLECTIONURI must be an Azure DevOps Services HTTPS URL.')
  }
  if (!collection.pathname.endsWith('/')) collection.pathname += '/'

  const projectPath = encodeURIComponent(required(project, 'SYSTEM_TEAMPROJECT'))
  const authorization = `Basic ${Buffer.from(`:${required(token, 'ADO_AUTOMATION_TOKEN')}`).toString('base64')}`

  async function request(path, { method = 'GET', body, patch = false } = {}) {
    const response = await fetchImpl(new URL(`${projectPath}/_apis/${path}`, collection), {
      method,
      headers: {
        authorization,
        accept: 'application/json',
        ...(body === undefined
          ? {}
          : { 'content-type': patch ? 'application/json-patch+json' : 'application/json' })
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30_000)
    })
    if (!response.ok) {
      throw new Error(`Azure DevOps ${method} ${path.split('?')[0]} failed with HTTP ${response.status}.`)
    }
    return response.json()
  }

  return {
    async listLabWorkItems() {
      const result = await request('wit/wiql?api-version=7.1', {
        method: 'POST',
        body: {
          query: `SELECT [System.Id] FROM WorkItems
            WHERE [System.TeamProject] = @project
              AND [System.WorkItemType] IN ('User Story', 'Bug')
              AND [System.State] NOT IN ('Closed', 'Removed')
              AND [System.Tags] CONTAINS 'ai-sdlc-lab'
            ORDER BY [System.CreatedDate] ASC`
        }
      })
      if (!Array.isArray(result.workItems)) {
        throw new Error('Azure DevOps returned an invalid work item query result.')
      }

      const ids = result.workItems.map((item) => workItemId(item.id))
      const items = []
      for (let index = 0; index < ids.length; index += 200) {
        const requestedIds = ids.slice(index, index + 200)
        const batch = await request('wit/workitemsbatch?api-version=7.1', {
          method: 'POST',
          body: {
            ids: requestedIds,
            fields: [
              'System.Id', 'System.Title', 'System.State', 'System.WorkItemType',
              'System.Tags', 'System.CreatedDate', 'System.Description',
              'Microsoft.VSTS.Common.AcceptanceCriteria', 'Microsoft.VSTS.TCM.ReproSteps'
            ]
          }
        })
        if (!Array.isArray(batch.value)) {
          throw new Error('Azure DevOps returned an invalid work item batch.')
        }
        const returnedIds = new Set(batch.value.map((item) => workItemId(item.id)))
        if (returnedIds.size !== requestedIds.length || requestedIds.some((id) => !returnedIds.has(id))) {
          throw new Error('Azure DevOps returned an incomplete work item batch. Rerun after checking permissions.')
        }
        items.push(...batch.value)
      }
      return items.filter((item) => hasTag(tagsOf(item), LAB_TAG))
    },

    getWorkItem(id) {
      return request(`wit/workitems/${workItemId(id)}?$expand=relations&api-version=7.1`)
    },

    getPullRequest(repositoryId, pullRequestId) {
      return request(`git/repositories/${encodeURIComponent(repositoryId)}/pullrequests/${workItemId(pullRequestId)}?api-version=7.1`)
    },

    async getMainCommit(repositoryId) {
      const result = await request(`git/repositories/${encodeURIComponent(repositoryId)}/refs?filter=heads%2Fmain&api-version=7.1`)
      const matches = Array.isArray(result.value)
        ? result.value.filter((ref) => ref.name === 'refs/heads/main')
        : []
      if (matches.length !== 1 || !/^[a-f0-9]{40}$/i.test(matches[0].objectId || '')) {
        throw new Error('Azure DevOps did not return a valid main branch ref.')
      }
      return matches[0].objectId.toLowerCase()
    },

    updateWorkItem(item, tags, history) {
      if (!Number.isSafeInteger(item.rev) || item.rev < 1) {
        throw new Error(`Work item ${item.id} has no valid revision.`)
      }
      return request(`wit/workitems/${workItemId(item.id)}?api-version=7.1`, {
        method: 'PATCH',
        patch: true,
        body: [
          { op: 'test', path: '/rev', value: item.rev },
          { op: 'add', path: '/fields/System.Tags', value: uniqueTags(tags).join('; ') },
          { op: 'add', path: '/fields/System.History', value: history }
        ]
      })
    }
  }
}

module.exports = {
  LAB_TAG,
  createClient,
  hasTag,
  required,
  sameTags,
  tagsOf,
  uniqueTags,
  workItemId
}
