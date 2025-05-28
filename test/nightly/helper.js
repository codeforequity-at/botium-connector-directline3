module.exports.readCaps = () => {
  // botium caps should come from env variable (.env) or botium.json. Priority is not defined if booth are filled
  let botiumJson
  try {
    botiumJson = require('./botium.json')
  } catch (err) {
  }
  const caps = botiumJson?.botium.Capabilities || {}
  Object.keys(process.env).filter(e => e.startsWith('BOTIUM_')).forEach((element) => {
    const elementToMerge = element.replace(/^BOTIUM_/, '')
    caps[elementToMerge] = process.env[element]
  })

  return caps
}
