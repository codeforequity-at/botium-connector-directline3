const DirectLine = require('botframework-directlinejs').DirectLine
const debug = require('debug')('botium-connector-directline3')

global.XMLHttpRequest = require('xhr2')

class BotiumConnectorDirectline3 {
  constructor ({ queueBotSays, caps }) {
    this.queueBotSays = queueBotSays
    this.caps = caps
  }

  Validate () {
    debug('Validate called')
    if (!this.caps['DIRECTLINE3_SECRET']) throw new Error('DIRECTLINE3_SECRET capability required')

    return Promise.resolve()
  }

  Build () {
    debug('Build called')
    this._stopSubscription()
    this.directLine = new DirectLine({
      secret: this.caps['DIRECTLINE3_SECRET'],
      webSocket: this.caps['DIRECTLINE3_WEBSOCKET'],
      pollingInterval: this.caps['DIRECTLINE3_POLLINGINTERVAL']
    })
    return Promise.resolve()
  }

  Start () {
    debug('Start called')
    this._stopSubscription()
    
    this.receivedMessageIds = {}
    this.subscription = this.directLine.activity$
      .filter(activity => activity.type === 'message' && activity.from.id !== 'me')
      .subscribe(
        message => {
          if (this.receivedMessageIds[message.id]) {
            debug('ignore already received message ', message)
          } else {
            debug('received message ', message)
            this.receivedMessageIds[message.id] = true
            const botMsg = { sender: 'bot', sourceData: message, messageText: message.text }
            this.queueBotSays(botMsg)
          }
        }
      )
    return Promise.resolve()
  }

  UserSays (msg) {
    debug('UserSays called')
    return new Promise((resolve, reject) => {
      this.directLine.postActivity({
        from: { id: msg.sender },
        type: 'message',
        text: msg.messageText
      }).subscribe(
        id => {
          debug('Posted activity, assigned ID ', id)
          resolve()
        },
        err => {
          debug('Error posting activity', err)
          reject(err)
        }
      )
    })
  }

  Stop () {
    debug('Stop called')
    this._stopSubscription()
    return Promise.resolve()
  }

  Clean () {
    debug('Clean called')
    this._stopSubscription()
    return Promise.resolve()
  }

  _stopSubscription() {
    if (this.subscription) {
      debug('unsubscribing from directline subscription')
      this.subscription.unsubscribe()
      this.subscription = null
    }
  }
}

module.exports = {
  PluginVersion: 1,
  PluginClass: BotiumConnectorDirectline3
}
