"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GrokProvider = exports.GoogleProvider = exports.OpenAIProvider = void 0;
exports.createProvider = createProvider;
const openai_1 = require("./openai");
const google_1 = require("./google");
const grok_1 = require("./grok");
var openai_2 = require("./openai");
Object.defineProperty(exports, "OpenAIProvider", { enumerable: true, get: function () { return openai_2.OpenAIProvider; } });
var google_2 = require("./google");
Object.defineProperty(exports, "GoogleProvider", { enumerable: true, get: function () { return google_2.GoogleProvider; } });
var grok_2 = require("./grok");
Object.defineProperty(exports, "GrokProvider", { enumerable: true, get: function () { return grok_2.GrokProvider; } });
function createProvider(modelString) {
    const [providerName, modelName] = modelString.split(':');
    if (providerName === 'openai') {
        return new openai_1.OpenAIProvider(modelName);
    }
    else if (providerName === 'google') {
        return new google_1.GoogleProvider(modelName);
    }
    else if (providerName === 'grok') {
        return new grok_1.GrokProvider(modelName);
    }
    else {
        throw new Error(`Unsupported provider: ${providerName}. Use format 'provider:model' (e.g., openai:gpt-4)`);
    }
}
