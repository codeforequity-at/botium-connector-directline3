const uuidv4 = require('uuid').v4
const mime = require('mime-types')
const _ = require('lodash')
const { DirectLine, ConnectionStatus } = require('botframework-directlinejs')
const debug = require('debug')('botium-connector-directline3')
const FormData = require('form-data')
const fetch = require('node-fetch')
const Queue = require('better-queue')
const fs = require('fs')
const path = require('path')
const xhr2 = require('xhr2')
const ws = require('ws')

const Capabilities = {
  DIRECTLINE3_SECRET: 'DIRECTLINE3_SECRET',
  DIRECTLINE3_WEBSOCKET: 'DIRECTLINE3_WEBSOCKET',
  DIRECTLINE3_DOMAIN: 'DIRECTLINE3_DOMAIN',
  DIRECTLINE3_POLLINGINTERVAL: 'DIRECTLINE3_POLLINGINTERVAL',
  DIRECTLINE3_GENERATE_USERNAME: 'DIRECTLINE3_GENERATE_USERNAME',
  DIRECTLINE3_BUTTON_TYPE: 'DIRECTLINE3_BUTTON_TYPE',
  DIRECTLINE3_BUTTON_VALUE_FIELD: 'DIRECTLINE3_BUTTON_VALUE_FIELD',
  DIRECTLINE3_HANDLE_ACTIVITY_TYPES: 'DIRECTLINE3_HANDLE_ACTIVITY_TYPES',
  DIRECTLINE3_ACTIVITY_VALUE_MAP: 'DIRECTLINE3_ACTIVITY_VALUE_MAP',
  DIRECTLINE3_ACTIVITY_TEMPLATE: 'DIRECTLINE3_ACTIVITY_TEMPLATE',
  DIRECTLINE3_ACTIVITY_VALIDATION: 'DIRECTLINE3_ACTIVITY_VALIDATION',
  DIRECTLINE3_WELCOME_ACTIVITY: 'DIRECTLINE3_WELCOME_ACTIVITY'
}

const { BotiumError, Capabilities: CoreCapabilities } = require('botium-core')

const Defaults = {
  [Capabilities.DIRECTLINE3_WEBSOCKET]: true,
  [Capabilities.DIRECTLINE3_POLLINGINTERVAL]: 1000,
  [Capabilities.DIRECTLINE3_GENERATE_USERNAME]: false,
  [Capabilities.DIRECTLINE3_BUTTON_TYPE]: 'event',
  [Capabilities.DIRECTLINE3_BUTTON_VALUE_FIELD]: 'name',
  [Capabilities.DIRECTLINE3_HANDLE_ACTIVITY_TYPES]: 'message',
  [Capabilities.DIRECTLINE3_ACTIVITY_VALIDATION]: 'error',
  [Capabilities.DIRECTLINE3_ACTIVITY_VALUE_MAP]: {
    event: 'name'
  }
}

class BotiumConnectorDirectline3 {
  constructor ({ queueBotSays, caps }) {
    this.queueBotSays = queueBotSays
    this.caps = caps
  }

  async Validate () {
    debug('Validate called')

    this.caps = Object.assign({}, Defaults, _.pickBy(this.caps, (value, key) => !Object.prototype.hasOwnProperty.call(Defaults, key) || !_.isString(value) || value !== ''))

    if (!this.caps.DIRECTLINE3_SECRET) throw new Error('DIRECTLINE3_SECRET capability required')
    if (!this.caps.DIRECTLINE3_BUTTON_TYPE) throw new Error('DIRECTLINE3_BUTTON_TYPE capability required')
    if (!this.caps.DIRECTLINE3_BUTTON_VALUE_FIELD) throw new Error('DIRECTLINE3_BUTTON_VALUE_FIELD capability required')
    if (!this.caps.DIRECTLINE3_HANDLE_ACTIVITY_TYPES) throw new Error('DIRECTLINE3_HANDLE_ACTIVITY_TYPES capability required')

    if (this.caps.DIRECTLINE3_ACTIVITY_VALUE_MAP) {
      if (_.isString(this.caps.DIRECTLINE3_ACTIVITY_VALUE_MAP)) {
        this.caps.DIRECTLINE3_ACTIVITY_VALUE_MAP = JSON.parse(this.caps.DIRECTLINE3_ACTIVITY_VALUE_MAP)
      }
    }
    if (this.caps.DIRECTLINE3_ACTIVITY_TEMPLATE) {
      if (_.isString(this.caps.DIRECTLINE3_ACTIVITY_TEMPLATE)) {
        this.caps.DIRECTLINE3_ACTIVITY_TEMPLATE = JSON.parse(this.caps.DIRECTLINE3_ACTIVITY_TEMPLATE)
      }
    }
  }

  async Build () {
    debug('Build called')
  }

  async Start () {
    debug('Start called')
    this.queue = new Queue((input, cb) => {
      input().then(result => cb(null, result)).catch(err => cb(err))
    })

    global.XMLHttpRequest = xhr2
    global.WebSocket = ws
    if (debug.enabled) {
      global.window = Object.assign(global.window || {}, { botchatDebug: true })
    }
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
      this.me = (this.caps.DIRECTLINE3_ACTIVITY_TEMPLATE && _.get(this.caps.DIRECTLINE3_ACTIVITY_TEMPLATE, 'from.id')) || 'me'
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
            const botMsg = { sender: 'bot', sourceData: message, media: [], buttons: [], cards: [], forms: [] }

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
              const mapAdaptiveCardRecursive = (c) => {
                const textBlocks = this._deepFilter(c.body, (t) => t.type, (t) => t.type === 'TextBlock')
                const imageBlocks = this._deepFilter(c.body, (t) => t.type, (t) => t.type === 'Image')
                const buttonBlocks = this._deepFilter(c.body, (t) => t.type, (t) => t.type.startsWith('Action.'))
                const actions = (c.actions || []).concat((buttonBlocks && buttonBlocks.map(mapButton)) || [])
                const subcards = actions.filter(a => (a.type === 'Action.ShowCard' && a.card && a.card.body)).map(a => mapAdaptiveCardRecursive(a.card))
                const inputs = this._deepFilter(c.body, (t) => t.type, (t) => t.type.startsWith('Input.'))
                const forms = []
                for (const input of inputs) {
                  forms.push({
                    name: input.id,
                    label: input.label,
                    type: input.type.substring('Input.'.length),
                    options: input.choices
                  })
                }
                return {
                  text: textBlocks && textBlocks.map(t => t.text),
                  image: imageBlocks && imageBlocks.length > 0 && mapImage(imageBlocks[0]),
                  buttons: actions.map(mapButton),
                  media: imageBlocks && imageBlocks.length > 1 && imageBlocks.slice(1).map(mapImage),
                  forms: forms.length ? forms : null,
                  cards: subcards.length ? subcards : null,
                  sourceData: c
                }
              }
              message.attachments && message.attachments.forEach(a => {
                if (a.contentType === 'application/vnd.microsoft.card.hero') {
                  botMsg.cards.push({
                    text: a.content.title || a.content.text,
                    subtext: a.content.subtitle,
                    content: a.content.text,
                    image: a.content.images && a.content.images.length > 0 && mapImage(a.content.images[0]),
                    buttons: a.content.buttons && a.content.buttons.map(mapButton),
                    media: a.content.images && a.content.images.length > 1 && a.content.images.slice(1).map(mapImage),
                    sourceData: a
                  })
                } else if (a.contentType === 'application/vnd.microsoft.card.adaptive') {
                  // if is send 'card inputs please' instead of 'card inputs' then there is an empty card in attachments
                  if (a.content) {
                    botMsg.cards.push(mapAdaptiveCardRecursive(a.content))
                  }
                } else if (a.contentType === 'application/vnd.microsoft.card.animation' ||
                  a.contentType === 'application/vnd.microsoft.card.audio' ||
                  a.contentType === 'application/vnd.microsoft.card.video') {
                  botMsg.cards.push({
                    text: a.content.title || a.content.text,
                    subtext: a.content.subtitle,
                    content: a.content.text,
                    image: a.content.image && mapImage(a.content.image),
                    buttons: a.content.buttons && a.content.buttons.map(mapButton),
                    media: a.content.media && a.content.media.map(mapMedia),
                    sourceData: a
                  })
                } else if (a.contentType === 'application/vnd.microsoft.card.thumbnail') {
                  botMsg.cards.push({
                    text: a.content.title || a.content.text,
                    subtext: a.content.subtitle,
                    content: a.content.text,
                    image: a.content.images && a.content.images.length > 0 && mapImage(a.content.images[0]),
                    buttons: a.content.buttons && a.content.buttons.map(mapButton),
                    media: a.content.images && a.content.images.length > 1 && a.content.images.slice(1).map(mapImage),
                    sourceData: a
                  })
                } else if (a.contentType === 'text/markdown') {
                  botMsg.cards.push({
                    content: a.content,
                    sourceData: {
                      type: 'AdaptiveCard',
                      body: [
                        {
                          type: 'TextBlock',
                          text: a.content
                        }
                      ]
                    }
                  })
                } else if (a.contentType === 'text/plain') {
                  botMsg.cards.push({
                    content: a.content
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
            this._runInQueue(async () => { this.queueBotSays(botMsg) })
          }
        },
        err => {
          debug(`Error in waiting for activities: ${err.message}`)
        }
      )

    let resultResolve = null
    let resultReject = null
    const resultPromise = new Promise((resolve, reject) => {
      resultResolve = resolve
      resultReject = reject
    })

    this.connSubscription = this.directLine.connectionStatus$
      .subscribe(
        connectionStatus => {
          switch (connectionStatus) {
            case ConnectionStatus.Uninitialized:
              debug(`Directline Connection Status: ${connectionStatus} / Uninitialized`)
              break
            case ConnectionStatus.Connecting:
              debug(`Directline Connection Status: ${connectionStatus} / Connecting`)
              break
            case ConnectionStatus.Online:
              debug(`Directline Connection Status: ${connectionStatus} / Online`)
              resultResolve && resultResolve()
              resultResolve = null
              break
            case ConnectionStatus.ExpiredToken:
              debug(`Directline Connection Status: ${connectionStatus} / ExpiredToken`)
              resultReject && resultReject(new Error('Directline token expired'))
              resultReject = null
              break
            case ConnectionStatus.FailedToConnect:
              debug(`Directline Connection Status: ${connectionStatus} / FailedToConnect`)
              resultReject && resultReject(new Error('Directline failed to connect - check the Directline Secret'))
              resultReject = null
              break
            case ConnectionStatus.Ended:
              debug(`Directline Connection Status: ${connectionStatus} / Ended`)
              break
          }
        },
        err => {
          debug(`Error in waiting for connectionStatus: ${err.message}`)
        }
      )

    if (this.caps[Capabilities.DIRECTLINE3_WELCOME_ACTIVITY]) {
      if (_.isString(this.caps[Capabilities.DIRECTLINE3_WELCOME_ACTIVITY])) {
        let initActivity = null
        try {
          initActivity = JSON.parse(this.caps[Capabilities.DIRECTLINE3_WELCOME_ACTIVITY])
        } catch (err) {
        }
        if (initActivity) {
          this.UserSays({ sourceData: initActivity }).catch(err => debug(`Failed to send DIRECTLINE3_WELCOME_ACTIVITY: ${err.message}`))
        } else {
          this.UserSays({ messageText: this.caps[Capabilities.DIRECTLINE3_WELCOME_ACTIVITY] }).catch(err => debug(`Failed to send DIRECTLINE3_WELCOME_ACTIVITY: ${err.message}`))
        }
      } else {
        this.UserSays({ sourceData: this.caps[Capabilities.DIRECTLINE3_WELCOME_ACTIVITY] }).catch(err => debug(`Failed to send DIRECTLINE3_WELCOME_ACTIVITY: ${err.message}`))
      }
    } else {
      this.directLine.getSessionId().subscribe(
        () => {},
        () => {}
      )
    }

    return resultPromise
  }

  async UserSays (msg) {
    debug('UserSays called')

    const activity = Object.assign({}, msg.sourceData || this.caps.DIRECTLINE3_ACTIVITY_TEMPLATE || {})
    if (msg.buttons && msg.buttons.length > 0 && (msg.buttons[0].text || msg.buttons[0].payload)) {
      let payload = msg.buttons[0].payload || msg.buttons[0].text
      try {
        payload = JSON.parse(payload)
      } catch (err) {
      }
      activity.type = this.caps[Capabilities.DIRECTLINE3_BUTTON_TYPE]
      _.set(activity, this.caps[Capabilities.DIRECTLINE3_BUTTON_VALUE_FIELD], payload)
    } else {
      if (!activity.type) {
        activity.type = 'message'
      }
      if (!_.isUndefined(msg.messageText)) {
        activity.text = msg.messageText
      }
    }
    if (!activity.from) {
      activity.from = { id: this.me }
    } else if (!activity.from.id) {
      activity.from.id = this.me
    }

    if (msg.forms) {
      activity.value = activity.value || {}
      msg.forms.forEach(f => {
        _.set(activity.value, f.name, f.value)
      })
    }

    if (msg.SET_ACTIVITY_VALUE) {
      _.keys(msg.SET_ACTIVITY_VALUE).forEach(key => {
        _.set(activity, key, msg.SET_ACTIVITY_VALUE[key])
      })
    }

    // validating the activity
    if (activity.text) {
      if (_.isObject(activity.text)) {
        const msg = `Activity is not correct. There is a JSON ${JSON.stringify(activity.text)} in text field. Check your capabilities`
        if (this.caps.DIRECTLINE3_ACTIVITY_VALIDATION === 'error') {
          throw new Error(msg)
        } else {
          debug(msg)
        }
      }
    }

    if (msg.media && msg.media.length > 0) {
      debug('Posting activity with attachments ', JSON.stringify(activity, null, 2))
      msg.sourceData = Object.assign(msg.sourceData || {}, { activity })

      const formData = new FormData()

      formData.append('activity', Buffer.from(JSON.stringify(activity)), {
        contentType: 'application/vnd.microsoft.activity',
        filename: 'blob'
      })

      for (let i = 0; i < msg.media.length; i++) {
        const attachment = msg.media[i]
        const attachmentName = path.basename(attachment.mediaUri)

        if (attachment.buffer) {
          formData.append('file', attachment.buffer, {
            filename: attachmentName
          })
        } else if (attachment.downloadUri && attachment.downloadUri.startsWith('file://')) {
          // This check is maybe not required. If possible and safe, MediaImport extracts Buffer from downloadUri.
          // This if-case should not be called at all.
          if (!this.caps[CoreCapabilities.SECURITY_ALLOW_UNSAFE]) {
            throw new BotiumError(
              'Security Error. Illegal configured MediaInput. Sending attachment using the filesystem is not allowed',
              {
                type: 'security',
                subtype: 'allow unsafe',
                source: 'botium-connector-directline',
                cause: { attachment }
              }
            )
          }
          const filepath = attachment.downloadUri.split('file://')[1]
          formData.append('file', fs.createReadStream(filepath), {
            filename: attachmentName
          })
        } else if (attachment.downloadUri) {
          const res = await fetch(attachment.downloadUri)
          const body = await res.buffer()

          formData.append('file', body, {
            filename: attachmentName
          })
        } else {
          throw new Error(`Media attachment ${attachment.mediaUri} not downloaded`)
        }
      }

      await this.directLine.checkConnection(true)
      const uploadUrl = `${this.directLine.domain}/conversations/${this.directLine.conversationId}/upload?userId=${activity.from.id}`
      debug(`Uploading attachments to ${uploadUrl}`)
      return this._runInQueue(async () => {
        try {
          const res = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${this.directLine.token}`
            },
            body: formData
          })
          const json = await res.json()
          if (json && json.id) {
            debug('Posted activity with attachments, assigned ID:', json.id)
          } else {
            throw new Error('No activity id returned')
          }
        } catch (err) {
          debug('Error posting activity with attachments', err)
          throw new Error(`Error posting activity: ${err.message || err}`)
        }
      })
    } else {
      debug('Posting activity ', JSON.stringify(activity, null, 2))
      msg.sourceData = Object.assign(msg.sourceData || {}, { activity })

      return this._runInQueue(() => new Promise((resolve, reject) => {
        this.directLine.postActivity(activity).subscribe(
          id => {
            debug('Posted activity, assigned ID:', id)
            resolve()
          },
          err => {
            debug('Error posting activity', err)
            reject(new Error(`Error posting activity: ${err.message || err}`))
          }
        )
      }))
    }
  }

  async Stop () {
    debug('Stop called')
    this.queue = null
    this._stopSubscription()
  }

  async Clean () {
    debug('Clean called')
    this._stopSubscription()
  }

  _stopSubscription () {
    if (this.subscription) {
      try {
        this.subscription.unsubscribe()
        this.subscription = null
        debug('unsubscribed from directline activity subscription')
      } catch (err) {
        debug(`unsubscribing from directline activity subscription failed: ${err.message}`)
      }
    }
    if (this.connSubscription) {
      try {
        this.connSubscription.unsubscribe()
        this.connSubscription = null
        debug('unsubscribing from directline connectionstatus subscription')
      } catch (err) {
        debug(`unsubscribing from directline connectionstatus subscription failed: ${err.message}`)
      }
    }
    if (this.directLine) {
      debug('ending directline connection')
      this.directLine.end()
      this.directLine = null
    }
  }

  async _runInQueue (fn) {
    if (this.queue) {
      return new Promise((resolve, reject) => {
        this.queue.push(fn)
          .on('finish', resolve)
          .on('failed', reject)
      })
    } else {
      throw new Error('Connector not yet started')
    }
  }

  _deepFilter (item, selectFn, filterFn) {
    if (!item) {
      return []
    }
    let result = []
    if (_.isArray(item)) {
      item.filter(selectFn).forEach(subItem => {
        result = result.concat(this._deepFilter(subItem, selectFn, filterFn))
      })
    } else if (selectFn(item)) {
      if (filterFn(item)) {
        result.push(item)
      } else {
        if (!item.type || item.type !== 'Action.ShowCard') {
          Object.getOwnPropertyNames(item).forEach(key => {
            result = result.concat(this._deepFilter(item[key], selectFn, filterFn))
          })
        }
      }
    }
    return result
  }
}

module.exports = {
  PluginVersion: 1,
  PluginClass: BotiumConnectorDirectline3,
  PluginDesc: {
    name: 'Microsoft Bot Framework (Directline 3)',
    provider: 'Microsoft',
    features: {
      sendAttachments: true,
      audioInput: true
    }
  }
}
