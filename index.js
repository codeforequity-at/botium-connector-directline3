const mime = require('mime-types')
const _ = require('lodash')
const { DirectLine, ConnectionStatus } = require('botframework-directlinejs')
const debug = require('debug')('botium-connector-directline3')

global.XMLHttpRequest = require('xhr2')

const Capabilities = {
  DIRECTLINE3_SECRET: 'DIRECTLINE3_SECRET',
  DIRECTLINE3_WEBSOCKET: 'DIRECTLINE3_WEBSOCKET',
  DIRECTLINE3_POLLINGINTERVAL: 'DIRECTLINE3_POLLINGINTERVAL'
}

const Defaults = {
  [Capabilities.DIRECTLINE3_WEBSOCKET]: true,
  [Capabilities.DIRECTLINE3_POLLINGINTERVAL]: 1000
}

class BotiumConnectorDirectline3 {
  constructor ({ queueBotSays, caps }) {
    this.queueBotSays = queueBotSays
    this.caps = caps
  }

  Validate () {
    debug('Validate called')
    this.caps = Object.assign({}, Defaults, this.caps)

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
            debug('received message ', JSON.stringify(message, null, 2))
            this.receivedMessageIds[message.id] = true
            const botMsg = { sender: 'bot', sourceData: message, media: [], buttons: [], cards: [] }
            botMsg.messageText = message.text || null

            const mapButton = (b) => ({
              text: b.title,
              payload: b.value || b.url || b.data,
              imageUri: b.image || b.iconUrl
            })
            const mapImage = (i) => ({
              mediaUri: i.url,
              mimeType: mime.lookup(i.url) || 'application/unknown',
              altText: i.alt || i.altText
            })
            const mapMedia = (m) => ({
              mediaUri: m.url,
              mimeType: mime.lookup(m.url) || 'application/unknown',
              altText: m.profile
            })

            message.attachments && message.attachments.forEach(a => {
              if (a.contentType === 'application/vnd.microsoft.card.hero') {
                botMsg.cards.push({
                  text: a.content.title,
                  image: a.content.images && a.content.images.length > 0 && mapImage(a.content.images[0]),
                  buttons: a.content.buttons && a.content.buttons.map(mapButton)
                })
              } else if (a.contentType === 'application/vnd.microsoft.card.adaptive') {
                const textBlocks = this._deepFilter(a.content.body, (t) => t.type, (t) => t.type === 'TextBlock')
                const imageBlocks = this._deepFilter(a.content.body, (t) => t.type, (t) => t.type === 'Image')

                botMsg.cards.push({
                  text: textBlocks && textBlocks.map(t => t.text),
                  image: imageBlocks && imageBlocks.length > 0 && mapImage(imageBlocks[0]),
                  buttons: a.content.actions && a.content.actions.map(mapButton)
                })
              } else if (a.contentType === 'application/vnd.microsoft.card.animation' ||
                a.contentType === 'application/vnd.microsoft.card.audio' ||
                a.contentType === 'application/vnd.microsoft.card.video') {
                botMsg.media = botMsg.media.concat(a.content.media && a.content.media.map(mapMedia))
                botMsg.buttons = botMsg.buttons.concat(a.content.buttons && a.content.buttons.map(mapButton))
              } else if (a.contentType === 'application/vnd.microsoft.card.thumbnail') {
                botMsg.media = botMsg.media.concat(a.content.images && a.content.images.map(mapImage))
                botMsg.buttons = botMsg.buttons.concat(a.content.buttons && a.content.buttons.map(mapButton))
              } else if (a.contentType && a.contentUrl) {
                botMsg.media.push({
                  mediaUri: a.contentUrl,
                  mimeType: a.contentType,
                  altText: a.name
                })
              }
            })

            this.queueBotSays(botMsg)
          }
        }
      )
    this.connSubscription = this.directLine.connectionStatus$
      .subscribe(connectionStatus => {
        switch (connectionStatus) {
          case ConnectionStatus.Uninitialized:
            debug(`Directline Connection Status: ${connectionStatus} / Uninitialized`)
            break
          case ConnectionStatus.Connecting:
            debug(`Directline Connection Status: ${connectionStatus} / Connecting`)
            break
          case ConnectionStatus.Online:
            debug(`Directline Connection Status: ${connectionStatus} / Online`)
            break
          case ConnectionStatus.ExpiredToken:
            debug(`Directline Connection Status: ${connectionStatus} / ExpiredToken`)
            break
          case ConnectionStatus.FailedToConnect:
            debug(`Directline Connection Status: ${connectionStatus} / FailedToConnect`)
            break
          case ConnectionStatus.Ended:
            debug(`Directline Connection Status: ${connectionStatus} / Ended`)
            break
        }
      })

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

  _stopSubscription () {
    if (this.subscription) {
      debug('unsubscribing from directline activity subscription')
      this.subscription.unsubscribe()
      this.subscription = null
    }
    if (this.connSubscription) {
      debug('unsubscribing from directline connectionstatus subscription')
      this.connSubscription.unsubscribe()
      this.connSubscription = null
    }
  }

  _deepFilter (item, selectFn, filterFn) {
    let result = []
    if (_.isArray(item)) {
      item.filter(selectFn).forEach(subItem => {
        result = result.concat(this._deepFilter(subItem, selectFn, filterFn))
      })
    } else if (selectFn(item)) {
      if (filterFn(item)) {
        result.push(item)
      } else {
        Object.getOwnPropertyNames(item).forEach(key => {
          result = result.concat(this._deepFilter(item[key], selectFn, filterFn))
        })
      }
    }
    return result
  }
}

module.exports = {
  PluginVersion: 1,
  PluginClass: BotiumConnectorDirectline3
}
