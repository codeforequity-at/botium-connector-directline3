const BotDriver = require('botium-core').BotDriver

const driver = new BotDriver()

driver.BuildFluent()
  .Start()
  .WaitBotSaysText(console.log)
  .UserSaysText('Show me a hero card')
  .WaitBotSaysText(console.log)
  .UserSaysText('Hello echo!')
  .WaitBotSaysText(console.log)
  .Stop()
  .Clean()
  .Exec()
  .then(() => {
    console.log('READY')
  })
  .catch((err) => {
    console.log('ERROR: ', err)
  })
