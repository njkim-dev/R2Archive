import assert from 'node:assert/strict'
import http from 'node:http'
import https from 'node:https'
import http2 from 'node:http2'

const headers = { 'X-R2Archive-Test': '1', 'User-Agent': 'R2Archive-edge-verification' }
const hosts = ['r2archive.com', 'music.r2archive.com', 'xyx.r2archive.com', 'r2music.njkim.tech']

function requestH2(host) {
  return new Promise((resolve, reject) => {
    const client = http2.connect(`https://${host}`)
    let finished = false
    const finish = (error, result) => {
      if (finished) return
      finished = true
      client.destroy()
      if (error) reject(error)
      else resolve(result)
    }
    client.on('error', error => finish(error))
    client.setTimeout(15000, () => finish(new Error(`${host}: HTTP/2 timeout`)))
    client.on('connect', () => {
      if (client.alpnProtocol !== 'h2') return finish(new Error(`${host}: HTTP/2 was not negotiated`))
      const request = client.request({ ':path': host === hosts[0] ? '/api/health/ready' : '/', ...Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])) })
      let response, body = ''
      request.setEncoding('utf8')
      request.on('response', value => { response = value })
      request.on('data', chunk => { body += chunk })
      request.on('error', error => finish(error))
      request.on('end', () => {
        try {
          finish(null, { host, protocol: 'h2', status: response[':status'], location: response.location || null, ready: host === hosts[0] ? JSON.parse(body).status === 'ready' : undefined })
        } catch {
          finish(new Error(`${host}: unexpected health response`))
        }
      })
      request.end()
    })
  })
}

function requestHttp(host, encrypted) {
  return new Promise((resolve, reject) => {
    const request = (encrypted ? https : http).get({ hostname: host, path: '/', headers, timeout: 15000 }, response => {
      response.resume()
      response.on('end', () => resolve({ host, protocol: encrypted ? 'https' : 'http', status: response.statusCode, location: response.headers.location || null }))
    })
    request.on('timeout', () => request.destroy(new Error(`${host}: HTTP timeout`)))
    request.on('error', reject)
  })
}

const results = await Promise.all(hosts.map(requestH2))
assert.equal(results[0].status, 200)
assert.equal(results[0].ready, true)
assert.equal(results[1].status, 308)
assert.equal(results[1].location, 'https://r2archive.com/music/')
assert.equal(results[2].status, 308)
assert.equal(results[2].location, 'https://r2archive.com/xyx/')
assert.equal(results[3].status, 301)
assert.equal(results[3].location, 'https://music.r2archive.com/')
const redirects = await Promise.all(hosts.map(host => requestHttp(host, false)))
for (const [index, result] of redirects.entries()) {
  assert.equal(result.status, 301)
  assert.equal(result.location, `https://${index === 3 ? hosts[1] : result.host}/`)
}
const qa = await requestHttp('qahub.njkim.tech', true)
assert.equal(qa.status, 200)
const practice = await requestHttp('practice.njkim.tech', true)
console.log(JSON.stringify({ r2archive: results, redirects, otherSites: [qa, practice], practiceHealthy: practice.status < 500 }, null, 2))
