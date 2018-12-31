# Botium Connector for Bot Framework Direct Line 3 API

[![NPM](https://nodei.co/npm/botium-connector-directline3.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/botium-connector-directline3/)

[ ![Codeship Status for codeforequity-at/botium-connector-directline3](https://app.codeship.com/projects/b55f7630-3017-0136-d8f8-0a3261184ed0/status?branch=master)](https://app.codeship.com/projects/288502)
[![npm version](https://badge.fury.io/js/botium-connector-directline3.svg)](https://badge.fury.io/js/botium-connector-directline3)
[![license](https://img.shields.io/github/license/mashape/apistatus.svg)]()

This is a [Botium](https://github.com/codeforequity-at/botium-core) connector for testing your Microsoft Bot Framework chatbots.

__Did you read the [Botium in a Nutshell](https://medium.com/@floriantreml/botium-in-a-nutshell-part-1-overview-f8d0ceaf8fb4) articles ? Be warned, without prior knowledge of Botium you won't be able to properly use this library!__

## How it works ?
The Direct Line API 3.0, part of the Microsoft Bot Framework, enables Botium to talk to a chatbot deployed and running with the Microsoft Bot Framework.

It can be used as any other Botium connector with all Botium Stack components:
* [Botium CLI](https://github.com/codeforequity-at/botium-cli/)
* [Botium Bindings](https://github.com/codeforequity-at/botium-bindings/)
* [Botium Box](https://www.botium.at)

## Requirements

* __Node.js and NPM__
* a __Microsoft Bot Framework__ chatbot, and user account with administrative rights
* a __project directory__ on your workstation to hold test cases and Botium configuration

## Install Botium and Directline3 Connector

When using __Botium CLI__:

```
> npm install -g botium-cli
> npm install -g botium-connector-directline3
> botium-cli init
> botium-cli run
```

When using __Botium Bindings__:

```
> npm install -g botium-bindings
> npm install -g botium-connector-directline3
> botium-bindings init mocha
> npm install && npm run mocha
```

When using __Botium Box__:

_Already integrated into Botium Box, no setup required_

## Connecting Microsoft Bot Framework to Botium

You have to connect the Direct Line channel (with version 3.0) in Azure Portal and obtain the secret - see [here](https://docs.microsoft.com/en-us/azure/bot-service/bot-service-channel-connect-directline) for instructions.

Open the file _botium.json_ in your working directory and add the secret:

```
{
  "botium": {
    "Capabilities": {
      "PROJECTNAME": "<whatever>",
      "CONTAINERMODE": "directline3",
      "DIRECTLINE3_SECRET": "<directline secret>"
    }
  }
}
```

To check the configuration, run the emulator (Botium CLI required) to bring up a chat interface in your terminal window:

```
> botium-cli emulator
```

Botium setup is ready, you can begin to write your [BotiumScript](https://github.com/codeforequity-at/botium-core/wiki/Botium-Scripting) files.

## Supported Capabilities

Set the capability __CONTAINERMODE__ to __directline3__ to activate this connector.

### DIRECTLINE3_SECRET *
The secret for accessing your chatbot from the Azure Portal.

_Note: it is advised to not add this secret to a configuration file but hand it over by environment variable BOTIUM_DIRECTLINE3_SECRET_

### DIRECTLINE3_WEBSOCKET
_true or false_
Wether to use Websocket connection or HTTP polling. Usually, using Websockets is prefered, but sometimes this is not possible (maybe with blocking proxies).

### DIRECTLINE3_POLLINGINTERVAL
_in milliseconds_
HTTP Polling interval

## Open Issues and Restrictions
