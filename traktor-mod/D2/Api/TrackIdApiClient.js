var API_BASE_URL = "http://localhost:8080"
var CLIENT_MARKER = "TraktorClient"
var TOKEN_RETRY_MS = 1000
var MAX_PENDING_REQUESTS = 100
var authToken = null
var tokenRequest = null
var tokenRetryTimer = null
var pendingRequests = []

function send(endpoint, data) {
  if (pendingRequests.length >= MAX_PENDING_REQUESTS) pendingRequests.shift()
  pendingRequests.push({ endpoint: endpoint, data: data })
  ensureToken()
}

function ensureToken() {
  if (authToken !== null || tokenRequest !== null) return
  tokenRequest = new XMLHttpRequest()
  tokenRequest.open("GET", API_BASE_URL + "/ingest-token", true)
  tokenRequest.setRequestHeader("X-Track-Id-Client", CLIENT_MARKER)
  tokenRequest.onload = function() {
    var response = tokenRequest
    tokenRequest = null
    if (response.status === 200) {
      try {
        var body = JSON.parse(response.responseText)
        if (typeof body.token === "string" && body.token.length > 0) {
          authToken = body.token
          flush()
          return
        }
      } catch (error) {
        scheduleTokenRetry()
        return
      }
    }
    scheduleTokenRetry()
  }
  tokenRequest.onerror = function() {
    tokenRequest = null
    scheduleTokenRetry()
  }
  tokenRequest.send()
}

function scheduleTokenRetry() {
  if (tokenRetryTimer !== null) return
  tokenRetryTimer = setTimeout(function() {
    tokenRetryTimer = null
    ensureToken()
  }, TOKEN_RETRY_MS)
}

function flush() {
  while (authToken !== null && pendingRequests.length > 0) {
    post(pendingRequests.shift())
  }
}

function post(item) {
  var request = new XMLHttpRequest()
  var body = JSON.stringify(item.data)
  var requestToken = authToken

  request.open("POST", API_BASE_URL + "/" + item.endpoint, true)
  request.setRequestHeader("Content-Type", "application/json")
  request.setRequestHeader("Content-Length", body.length)
  request.setRequestHeader("X-Track-Id-Client", CLIENT_MARKER)
  request.setRequestHeader("Authorization", "Bearer " + requestToken)
  request.onload = function() {
    if (request.status !== 401) return
    pendingRequests.unshift(item)
    if (authToken === requestToken) authToken = null
    ensureToken()
    flush()
  }
  request.send(body)
}
