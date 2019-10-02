const util = require('util')
const uuidv4 = require('uuid/v4')
const mime = require('mime-types')
const _ = require('lodash')
const { DirectLine, ConnectionStatus } = require('botframework-directlinejs')
const debug = require('debug')('botium-connector-directline3')
const FormData = require('form-data')
const fetch = require('node-fetch')
const fs = require('fs')
const path = require('path')

global.XMLHttpRequest = require('xhr2')

if (debug.enabled) {
  global.window = Object.assign(global.window || {}, { botchatDebug: true })
} else {
  global.window = Object.assign(global.window || {}, { botchatDebug: false })
}

const Capabilities = {
  DIRECTLINE3_SECRET: 'DIRECTLINE3_SECRET',
  DIRECTLINE3_WEBSOCKET: 'DIRECTLINE3_WEBSOCKET',
  DIRECTLINE3_DOMAIN: 'DIRECTLINE3_DOMAIN',
  DIRECTLINE3_POLLINGINTERVAL: 'DIRECTLINE3_POLLINGINTERVAL',
  DIRECTLINE3_GENERATE_USERNAME: 'DIRECTLINE3_GENERATE_USERNAME',
  DIRECTLINE3_BUTTON_TYPE: 'DIRECTLINE3_BUTTON_TYPE',
  DIRECTLINE3_BUTTON_VALUE_FIELD: 'DIRECTLINE3_BUTTON_VALUE_FIELD',
  DIRECTLINE3_HANDLE_ACTIVITY_TYPES: 'DIRECTLINE3_HANDLE_ACTIVITY_TYPES',
  DIRECTLINE3_ACTIVITY_VALUE_MAP: 'DIRECTLINE3_ACTIVITY_VALUE_MAP'
}

const Defaults = {
  [Capabilities.DIRECTLINE3_WEBSOCKET]: true,
  [Capabilities.DIRECTLINE3_POLLINGINTERVAL]: 1000,
  [Capabilities.DIRECTLINE3_GENERATE_USERNAME]: false,
  [Capabilities.DIRECTLINE3_BUTTON_TYPE]: 'event',
  [Capabilities.DIRECTLINE3_BUTTON_VALUE_FIELD]: 'name',
  [Capabilities.DIRECTLINE3_HANDLE_ACTIVITY_TYPES]: 'message',
  [Capabilities.DIRECTLINE3_ACTIVITY_VALUE_MAP]: {
    event: 'name'
  }
}

class BotiumConnectorDirectline3 {
  constructor ({ queueBotSays, caps }) {
    this.queueBotSays = queueBotSays
    this.caps = caps
  }

  Validate () {
    debug('Validate called')

    this.caps = Object.assign({}, Defaults, _.pickBy(this.caps, (value, key) => !Object.prototype.hasOwnProperty.call(Defaults, key) || !_.isString(value) || value !== ''))

    if (!this.caps.DIRECTLINE3_SECRET) throw new Error('DIRECTLINE3_SECRET capability required')
    if (!this.caps.DIRECTLINE3_BUTTON_TYPE) throw new Error('DIRECTLINE3_BUTTON_TYPE capability required')
    if (!this.caps.DIRECTLINE3_BUTTON_VALUE_FIELD) throw new Error('DIRECTLINE3_BUTTON_VALUE_FIELD capability required')
    if (!this.caps.DIRECTLINE3_HANDLE_ACTIVITY_TYPES) throw new Error('DIRECTLINE3_HANDLE_ACTIVITY_TYPES capability required')

    return Promise.resolve()
  }

  Build () {
    debug('Build called')
    return Promise.resolve()
  }

  Start () {
    debug('Start called')
    this._stopSubscription()
    this.directLine = new DirectLine({
      secret: this.caps.DIRECTLINE3_SECRET,
      webSocket: this.caps.DIRECTLINE3_WEBSOCKET,
      domain: this.caps.DIRECTLINE3_DOMAIN,
      pollingInterval: this.caps.DIRECTLINE3_POLLINGINTERVAL
    })

    if (this.caps.DIRECTLINE3_GENERATE_USERNAME) {
      this.me = uuidv4()
    } else {
      this.me = 'me'
    }

    const isValidActivityType = (activityType) => {
      const filter = this.caps.DIRECTLINE3_HANDLE_ACTIVITY_TYPES
      if (_.isString(filter)) {
        return filter.indexOf(activityType) >= 0
      } else if (_.isArray(filter)) {
        return filter.findIndex(f => f === activityType) >= 0
      } else {
        return false
      }
    }

    this.receivedMessageIds = {}
    this.subscription = this.directLine.activity$
      .filter(activity => isValidActivityType(activity.type) && activity.from.id !== this.me)
      .subscribe(
        message => {
          if (this.receivedMessageIds[message.id]) {
            debug('ignore already received message ', message)
          } else {
            debug('received message ', JSON.stringify(message, null, 2))
            this.receivedMessageIds[message.id] = true
            const botMsg = { sender: 'bot', sourceData: message, media: [], buttons: [], cards: [] }

            if (message.type === 'message') {
              botMsg.messageText = message.text || null

              const mapButton = (b) => ({
                text: b.title || b.text,
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
                    text: a.content.title || a.content.text,
                    subtext: a.content.subtitle,
                    content: a.content.text,
                    image: a.content.images && a.content.images.length > 0 && mapImage(a.content.images[0]),
                    buttons: a.content.buttons && a.content.buttons.map(mapButton),
                    media: a.content.images && a.content.images.map(mapImage)
                  })
                } else if (a.contentType === 'application/vnd.microsoft.card.adaptive') {
                  const textBlocks = this._deepFilter(a.content.body, (t) => t.type, (t) => t.type === 'TextBlock')
                  const imageBlocks = this._deepFilter(a.content.body, (t) => t.type, (t) => t.type === 'Image')
                  const buttonBlocks = this._deepFilter(a.content.body, (t) => t.type, (t) => t.type.startsWith('Action.'))

                  botMsg.cards.push({
                    text: textBlocks && textBlocks.map(t => t.text),
                    image: imageBlocks && imageBlocks.length > 0 && mapImage(imageBlocks[0]),
                    buttons: ((a.content.actions && a.content.actions.map(mapButton)) || []).concat((buttonBlocks && buttonBlocks.map(mapButton)) || [])
                  })
                } else if (a.contentType === 'application/vnd.microsoft.card.animation' ||
                  a.contentType === 'application/vnd.microsoft.card.audio' ||
                  a.contentType === 'application/vnd.microsoft.card.video') {
                  botMsg.cards.push({
                    text: a.content.title || a.content.text,
                    subtext: a.content.subtitle,
                    content: a.content.text,
                    image: a.content.image && mapImage(a.content.image),
                    buttons: a.content.buttons && a.content.buttons.map(mapButton),
                    media: a.content.media && a.content.media.map(mapMedia)
                  })
                } else if (a.contentType === 'application/vnd.microsoft.card.thumbnail') {
                  botMsg.cards.push({
                    text: a.content.title || a.content.text,
                    subtext: a.content.subtitle,
                    content: a.content.text,
                    image: a.content.images && a.content.images.length > 0 && mapImage(a.content.images[0]),
                    buttons: a.content.buttons && a.content.buttons.map(mapButton),
                    media: a.content.images && a.content.images.map(mapImage)
                  })
                } else if (a.contentType && a.contentUrl) {
                  botMsg.media.push({
                    mediaUri: a.contentUrl,
                    mimeType: a.contentType,
                    altText: a.name
                  })
                } else if (a.content && a.content.buttons && a.content.buttons.length > 0) {
                  a.content.buttons.forEach(b => {
                    botMsg.buttons.push(mapButton(b))
                  })
                }
              })

              message.suggestedActions && message.suggestedActions.actions && message.suggestedActions.actions.forEach(a => {
                botMsg.buttons.push(mapButton(a))
              })

              if (message.entities && message.entities.length > 0) {
                botMsg.entities = message.entities.map(e => ({
                  name: e.name,
                  value: e.value
                }))
              }

              if (!botMsg.messageText && botMsg.cards) {
                const card = botMsg.cards.find(c => c.text)
                if (card && _.isArray(card.text) && card.text.length > 0) {
                  botMsg.messageText = card.text[0]
                } else if (card && _.isString(card.text)) {
                  botMsg.messageText = card.text
                }
              }
              if (!botMsg.messageText && botMsg.buttons) {
                const button = botMsg.buttons.find(b => b.text)
                if (button) {
                  botMsg.messageText = button.text
                }
              }
            } else {
              const valueMap = this.caps.DIRECTLINE3_ACTIVITY_VALUE_MAP
              if (valueMap && valueMap[message.type]) {
                botMsg.messageText = message[valueMap[message.type]]
              } else {
                botMsg.messageText = message.type
              }
            }

            setTimeout(() => this.queueBotSays(botMsg), 0)
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
    return new Promise(async (resolve, reject) => { // eslint-disable-line no-async-promise-executor
      const activity = msg.sourceData || {}
      if (msg.buttons && msg.buttons.length > 0 && (msg.buttons[0].text || msg.buttons[0].payload)) {
        let payload = msg.buttons[0].payload || msg.buttons[0].text
        try {
          payload = JSON.parse(payload)
        } catch (err) {
        }
        activity.type = this.caps[Capabilities.DIRECTLINE3_BUTTON_TYPE]
        activity[this.caps[Capabilities.DIRECTLINE3_BUTTON_VALUE_FIELD]] = payload
      } else {
        if (!activity.type) {
          activity.type = 'message'
        }
        activity.text = msg.messageText
      }
      if (!activity.from) {
        activity.from = { id: this.me }
      } else if (!activity.from.id) {
        activity.from.id = this.me
      }

      if (msg.forms) {
        activity.value = {}
        msg.forms.forEach(f => {
          activity.value[f.name] = f.value
        })
      }

      if (msg.SET_ACTIVITY_VALUE) {
        _.keys(msg.SET_ACTIVITY_VALUE).forEach(key => {
          _.set(activity, key, msg.SET_ACTIVITY_VALUE[key])
        })
      }

      if (msg.media && msg.media.length > 0) {
        debug('Posting activity with attachments ', JSON.stringify(activity, null, 2))
        const formData = new FormData()

        if (activity.text) {
          formData.append('activity', Buffer.from(JSON.stringify(activity)), {
            contentType: 'application/vnd.microsoft.activity',
            filename: 'blob'
          })
        }

        for (let i = 0; i < msg.media.length; i++) {
          const attachment = msg.media[i]
          const attachmentName = path.basename(attachment.mediaUri)

          if (attachment.mediaUri.startsWith('file://')) {
            const filepath = attachment.mediaUri.split('file://')[1]
            formData.append('file', fs.createReadStream(filepath), {
              filename: attachmentName
            })
          } else {
            const { body } = await fetch(attachment.mediaUri)

            formData.append('file', body, {
              filename: attachmentName,
              contentType: 'image/png'
            })
          }
        }

        await this.directLine.checkConnection(true)
        const uploadUrl = `${this.directLine.domain}/conversations/${this.directLine.conversationId}/upload?userId=${activity.from.id}`
        debug(`Uploading attachments to ${uploadUrl}`)
        fetch(uploadUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.directLine.token}`,
            'Content-Type': 'multipart/form-data'
          },
          body: formData
        }).catch(err => {
          debug('Error posting activity with attachments', err)
          reject(new Error(`Error posting activity: ${err}`))
        }).then(async (res) => {
          const json = await res.json()
          if (json.id) {
            debug('Posted activity with attachments, assigned ID:', json.id)
            resolve()
          } else {
            reject(new Error(`Error posting activity with attachments: ${util.inspect(json)}`))
          }
        })
      } else {
        debug('Posting activity ', JSON.stringify(activity, null, 2))

        this.directLine.postActivity(activity).subscribe(
          id => {
            debug('Posted activity, assigned ID:', id)
            resolve()
          },
          err => {
            debug('Error posting activity', err)
            reject(new Error(`Error posting activity: ${err}`))
          }
        )
      }
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
    if (this.directLine) {
      debug('ending directline connection')
      this.directLine.end()
      this.directLine = null
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
