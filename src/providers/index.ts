
import { LLMProvider } from '../types';
import { OpenAIProvider } from './openai';
import { GoogleProvider } from './google';
import { GrokProvider } from './grok';

export { OpenAIProvider } from './openai';
export { GoogleProvider } from './google';
export { GrokProvider } from './grok';

export function createProvider(modelString: string): LLMProvider {
    const [providerName, modelName] = modelString.split(':');

    if (providerName === 'openai') {
        return new OpenAIProvider(modelName);
    } else if (providerName === 'google') {
        return new GoogleProvider(modelName);
    } else if (providerName === 'grok') {
        return new GrokProvider(modelName);
    } else {
        throw new Error(`Unsupported provider: ${providerName}. Use format 'provider:model' (e.g., openai:gpt-4)`);
    }
}
