const BotDriver = require('botium-core').BotDriver

const driver = new BotDriver()
  
 driver.BuildFluent()
  .Start()
  .UserSaysText('Start')
  .WaitBotSaysText(console.log)
  .UserSaysText('Hallo')
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
