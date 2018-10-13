const BotDriver = require('botium-core').BotDriver

const driver = new BotDriver()

driver.BuildFluent()
  .Start()
  .UserSaysText('Hello')
  .WaitBotSaysText(console.log)
  .WaitBotSays((msg) => console.log(JSON.stringify(msg, null, 2)))
  .WaitBotSays((msg) => console.log(JSON.stringify(msg, null, 2)))
  .WaitBotSays((msg) => console.log(JSON.stringify(msg, null, 2)))
  .WaitBotSays((msg) => console.log(JSON.stringify(msg, null, 2)))
  .Stop()
  .Clean()
  .Exec()
  .then(() => {
    console.log('READY')
  })
  .catch((err) => {
    console.log('ERROR: ', err)
  })
