require('dotenv').config()
const assert = require('chai').assert
const Connector = require('../../index.js').PluginClass
const { readCaps } = require('./helper')

describe('connector', function () {
  beforeEach(async function () {
    this.caps = readCaps()
    this.botMsgPromise = new Promise(resolve => {
      this.botMsgPromiseResolve = resolve
    })
    const queueBotSays = (botMsg) => {
      this.botMsgPromiseResolve(botMsg)
    }
    this.connector = new Connector({ queueBotSays, caps: this.caps })
    await this.connector.Validate()
    await this.connector.Start()
  })

  it('should successfully get an answer for say hello', async function () {
    await this.connector.UserSays({ messageText: 'Hello' })
    const botMsg = await this.botMsgPromise
    assert.isTrue(botMsg?.nlp?.intent?.name === '~emohello', `Incorrect intent "${botMsg?.nlp?.intent?.name}"`)
  }).timeout(10000)

  afterEach(async function () {
    await this.connector.Stop()
  })
})
