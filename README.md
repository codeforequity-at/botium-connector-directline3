# Botium Connector for Bot Framework Direct Line 3 API

[![NPM](https://nodei.co/npm/botium-connector-directline3.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/botium-connector-directline3/)

[ ![Codeship Status for codeforequity-at/botium-connector-directline3](https://app.codeship.com/projects/b55f7630-3017-0136-d8f8-0a3261184ed0/status?branch=master)](https://app.codeship.com/projects/288502)
[![npm version](https://badge.fury.io/js/botium-connector-directline3.svg)](https://badge.fury.io/js/botium-connector-directline3)
[![license](https://img.shields.io/github/license/mashape/apistatus.svg)]()

This is a [Botium](https://github.com/codeforequity-at/botium-core) connector for testing your Microsoft Bot Framework chatbots.

__Did you read the [Botium in a Nutshell](https://medium.com/@floriantreml/botium-in-a-nutshell-part-1-overview-f8d0ceaf8fb4) articles ? Be warned, without prior knowledge of Botium you won't be able to properly use this library!__

## How it works ?
The Direct Line API 3.0, part of the Microsoft Bot Framework, enables Botium to talk to a chatbot deployed and running with the Microsoft Bot Framework.

The Direct Line version number does not correspond to the Microsoft Bot Framework version number. So this connector actually supports  __Microsoft Bot Framework v3 as well as v4__.

It can be used as any other Botium connector with all Botium Stack components:
* [Botium CLI](https://github.com/codeforequity-at/botium-cli/)
* [Botium Bindings](https://github.com/codeforequity-at/botium-bindings/)
* [Botium Box](https://www.botium.at)

This connector extracts form contents from adaptive cards. You can assert them with [Forms Asserter](https://botium.atlassian.net/wiki/spaces/BOTIUM/pages/48627713/Forms+Asserter).

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

## Finetuning Directline3 Activity

For finetuning the [Activity object](https://docs.microsoft.com/en-us/azure/bot-service/rest-api/bot-framework-rest-connector-api-reference?view=azure-bot-service-4.0#activity-object) sent to your bot, you can use the [UPDATE_CUSTOM logic hook](https://botium.atlassian.net/wiki/spaces/BOTIUM/pages/48660497/Integrated+Logic+Hooks). This example will add some custom values to the [channelData](https://docs.microsoft.com/en-us/azure/bot-service/rest-api/bot-framework-rest-connector-channeldata?view=azure-bot-service-4.0):

    #me
    do some channel specific thingy ...
    UPDATE_CUSTOM SET_ACTIVITY_VALUE|channelData|{"channelData1": "botium", "channelData2": "something else"}

The parameters are:
1. SET_ACTIVITY_VALUE
2. The path to the activity field
3. The value of the activity field

Another option for having full control over the activity is to use the **DIRECTLINE3_ACTIVITY_TEMPLATE** capability. It is a JSON structure used as a template when sending an activity to the bot.

```
    ...
    "DIRECTLINE3_ACTIVITY_TEMPLATE": {
      "channelData": {
        "my-special-channel-data": "..."
      }
    }
    ...
```


## Supported Capabilities

Set the capability __CONTAINERMODE__ to __directline3__ to activate this connector.

### DIRECTLINE3_SECRET *
The secret for accessing your chatbot from the Azure Portal.

_Note: it is advised to not add this secret to a configuration file but hand it over by environment variable BOTIUM_DIRECTLINE3_SECRET_

### DIRECTLINE3_DOMAIN
If not using the default Direct Line endpoint, e.g. if you are using a region-specific endpoint, put its full URL here

### DIRECTLINE3_WEBSOCKET
_true or false_
Wether to use Websocket connection or HTTP polling. Usually, using Websockets is prefered, but sometimes this is not possible (maybe with blocking proxies).

_Currently, only HTTP polling supported (Bot Framework restriction)_

### DIRECTLINE3_POLLINGINTERVAL
_in milliseconds_
HTTP Polling interval

### DIRECTLINE3_BUTTON_TYPE and DIRECTLINE3_BUTTON_VALUE_FIELD
_Default type: event_

_Default field: name_

Activity fields to use for simulating button clicks by the user. Depending on your implementation, you maybe have to change the activity type or the field to use - see [here](https://docs.microsoft.com/en-us/azure/bot-service/nodejs/bot-builder-nodejs-backchannel) for some ideas.

Usually, the activity type is _event_, and the button value is submitted in the _name_ field, but using those capabilities you can adapt it to your implementation.

_Note: if you want to disable this, then set DIRECTLINE3_BUTTON_TYPE to "message" and DIRECTLINE3_BUTTON_VALUE_FIELD to "text", to make the button clicks appear as normal user text input_

### DIRECTLINE3_GENERATE_USERNAME
_Default: false_

Botium simulates conversations with username _me_. Depending on your implementation, running multiple conversations with the same username could make them fail (for example, session handling).

Setting this capability to _true_ will generate a new username (uuid) for each conversation.

### DIRECTLINE3_HANDLE_ACTIVITY_TYPES
_Default: "message"_

Activity types to handle (either JSON array or comma separated list). All other activity types will be ignored.

Example: set to "message,event" (or [ "message", "event" ]) to also handle Bot Framework event activities with Botium

### DIRECTLINE3_ACTIVITY_VALUE_MAP
_default: { 'event': 'name' }_

When using activity types other than _message_, this capability maps the activity type to the activity attribute to use as message text for Botium.

By default, for _event_ activities the _name_ attribute is used as message text, for other activity types the activity type itself.

### DIRECTLINE3_ACTIVITY_TEMPLATE
_default: {}_

JSON object holding the activity template used for sending activities to the bot.

# Current Restrictions

* Only HTTP Polling supported (WebSocket not available in Node.js)
* Typing indicator is not transmitted over HTTP Polling (Bot Framework restriction)
