const token = process.env.METAAPI_TOKEN

let MetaApiClass = null
let api = null

async function loadMetaApiModule() {
  if (!MetaApiClass) {
    // Package "import" condition points at esm-web (browser); server must use the Node build.
    const mod = await import('metaapi.cloud-sdk/esm-node')
    MetaApiClass = mod.default
  }
  return MetaApiClass
}

export async function getMetaApi() {
  if (!token) {
    throw new Error('Missing METAAPI_TOKEN (server env only, never NEXT_PUBLIC_*)')
  }
  if (!api) {
    const MetaApi = await loadMetaApiModule()
    api = new MetaApi(token)
  }
  return api
}

/**
 * @param {object} p
 * @param {string} p.login
 * @param {string} p.password
 * @param {string} p.server
 * @param {'mt4'|'mt5'} p.platform
 * @param {string} [p.accountName]
 * @param {string} [p.provisioningProfileId] — defaults to METAAPI_PROVISIONING_PROFILE_ID
 */
export async function connectAccount({ login, password, server, platform, accountName, provisioningProfileId }) {
  const profileId = provisioningProfileId || process.env.METAAPI_PROVISIONING_PROFILE_ID
  if (!profileId) {
    throw new Error(
      'MetaApi provisioning profile is required. Set METAAPI_PROVISIONING_PROFILE_ID in your environment (from MetaApi dashboard).'
    )
  }

  const metaApi = await getMetaApi()
  const m = metaApi.metatraderAccountApi

  const all = await m.getAccountsWithInfiniteScrollPagination()
  const wantVersion = platform === 'mt5' ? 5 : 4
  let account = all.find(
    (a) => String(a.login) === String(login) && a.server === server && a.version === wantVersion
  )

  if (!account) {
    account = await m.createAccount({
      name: accountName || `${platform.toUpperCase()} ${login}`,
      type: 'cloud-g2',
      login: String(login),
      password,
      server,
      platform,
      magic: 0,
      provisioningProfileId: profileId,
    })
  }

  await account.deploy()
  await account.waitDeployed(300, 1000)
  await account.waitConnected(300, 1000)

  return {
    accountId: account.id,
    state: account.state,
    connectionStatus: account.connectionStatus,
  }
}

export async function getAccountInfo(metaApiAccountId) {
  const a = await getMetaApi()
  const account = await a.metatraderAccountApi.getAccount(metaApiAccountId)
  const connection = account.getRPCConnection()
  await connection.connect()
  await connection.waitSynchronized(300)
  const info = await connection.getAccountInformation()
  await connection.close()
  return info
}

/**
 * Fetches all deals in [startDate, endDate) via RPC pagination.
 */
export async function getTradeHistory(metaApiAccountId, startDate, endDate) {
  const a = await getMetaApi()
  const account = await a.metatraderAccountApi.getAccount(metaApiAccountId)
  const connection = account.getRPCConnection()
  await connection.connect()
  await connection.waitSynchronized(300)

  const start = new Date(startDate)
  const end = new Date(endDate)
  const out = []
  const limit = 1000
  let offset = 0

  for (;;) {
    const batch = await connection.getDealsByTimeRange(start, end, offset, limit)
    const deals = batch?.deals || []
    out.push(...deals)
    if (deals.length < limit) break
    offset += limit
  }

  await connection.close()
  return out
}

export async function removeAccount(metaApiAccountId) {
  const a = await getMetaApi()
  const account = await a.metatraderAccountApi.getAccount(metaApiAccountId)
  try {
    await account.undeploy()
    await account.waitUndeployed(120, 1000)
  } catch {
    // may already be undeployed
  }
  await account.remove()
}
