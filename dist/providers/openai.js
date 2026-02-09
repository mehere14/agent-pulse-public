"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAIProvider = void 0;
const openai_1 = __importDefault(require("openai"));
const zod_1 = require("zod");
const file_utils_1 = require("../utils/file-utils");
class OpenAIProvider {
    constructor(model, apiKey) {
        this.model = model;
        const key = apiKey || process.env.OPENAI_API_KEY;
        this.client = new openai_1.default({
            apiKey: key,
        });
    }
    async generate(system, prompt, files, tools, config, output_schema, onToken) {
        // 1. Prepare messages
        const messages = [];
        if (system) {
            messages.push({ role: 'system', content: system });
        }
        if (Array.isArray(prompt)) {
            // Mapping AgentMessage to OpenAI messages
            for (const msg of prompt) {
                if (msg.role === 'user') {
                    messages.push({ role: 'user', content: msg.content });
                }
                else if (msg.role === 'assistant') {
                    messages.push({
                        role: 'assistant',
                        content: msg.content || null,
                        tool_calls: msg.tool_calls?.map(tc => ({
                            id: tc.id,
                            type: 'function',
                            function: {
                                name: tc.name,
                                arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments)
                            }
                        }))
                    });
                }
                else if (msg.role === 'tool') {
                    messages.push({
                        role: 'tool',
                        tool_call_id: msg.tool_call_id,
                        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
                    });
                }
            }
        }
        else {
            // Handle files - read markdown files and inject into prompt
            let userContent = prompt;
            // Read and append file contents if provided
            if (files && files.length > 0) {
                try {
                    const fileContents = (0, file_utils_1.readMarkdownFiles)(files);
                    userContent = `${fileContents}\n\n${prompt}`;
                }
                catch (error) {
                    throw new Error(`File reading error: ${error.message}`);
                }
            }
            // OpenAI requires the word "json" in messages when using json_object response format
            if (output_schema) {
                userContent = `${userContent}\n\nPlease respond with valid JSON.`;
            }
            messages.push({ role: 'user', content: userContent });
        }
        // 2. Prepare Tools
        let openAITools;
        if (tools && tools.length > 0) {
            openAITools = tools.map(t => ({
                type: 'function',
                function: {
                    name: t.name,
                    description: t.description,
                    parameters: {}, // Placeholder to be filled below
                },
            }));
            // Fill parameters separately to avoid TS2589
            openAITools.forEach((tool, index) => {
                if (tools[index]) {
                    const schema = (0, zod_1.toJSONSchema)(tools[index].parameters);
                    tool.function.parameters = schema;
                }
            });
        }
        // 3. Prepare config
        // Standardize config overrides? 
        // Spec: "config: Model-specific overrides (temperature, topP, json_mode)"
        // 4. Call API
        const stream = await this.client.chat.completions.create({
            model: this.model,
            messages,
            tools: openAITools,
            tool_choice: openAITools ? 'auto' : undefined,
            stream: true,
            stream_options: { include_usage: true }, // Enable usage tracking in streaming
            temperature: config?.temperature,
            max_tokens: config?.max_tokens,
            response_format: output_schema ? { type: 'json_object' } : undefined, // Or use strict schema
        });
        let fullContent = '';
        let toolCalls = [];
        let usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
        // Stream loop
        for await (const chunk of stream) {
            if (chunk.choices[0]?.delta?.content) {
                const token = chunk.choices[0].delta.content;
                fullContent += token;
                onToken(token);
            }
            if (chunk.choices[0]?.delta?.tool_calls) {
                // Accumulate tool calls
                const chunkToolCalls = chunk.choices[0].delta.tool_calls;
                for (const tc of chunkToolCalls) {
                    const index = tc.index;
                    if (!toolCalls[index]) {
                        toolCalls[index] = tc;
                    }
                    else {
                        // Merge
                        if (tc.function?.name)
                            toolCalls[index].function.name += tc.function.name;
                        if (tc.function?.arguments)
                            toolCalls[index].function.arguments += tc.function.arguments;
                    }
                }
            }
            // Usage is often in the last chunk for OpenAI streaming (if include_usage options set)
            // Standard OpenAI SDK types for Chunk might not always have usage unless enabled.
            // But let's assume we might estimate or get it. 
            // OpenAI streaming usage support requires `stream_options: { include_usage: true }`.
            if (chunk.usage) {
                usage = {
                    input_tokens: chunk.usage.prompt_tokens,
                    output_tokens: chunk.usage.completion_tokens,
                    total_tokens: chunk.usage.total_tokens
                };
            }
        }
        // Parse structured output if needed
        let finalContent = fullContent;
        if (output_schema && !toolCalls.length) {
            try {
                finalContent = JSON.parse(fullContent);
                // Validate?
                output_schema.parse(finalContent);
            }
            catch (e) {
                console.warn("Failed to parse JSON output", e);
            }
        }
        // Map internal tool calls to generic format if needed, or pass raw
        let genericToolCalls = undefined;
        if (toolCalls.length > 0) {
            genericToolCalls = toolCalls.map(tc => ({
                name: tc.function?.name,
                arguments: tc.function?.arguments ? JSON.parse(tc.function.arguments) : {},
                id: tc.id
            }));
        }
        return {
            content: finalContent,
            tool_calls: genericToolCalls,
            usage,
            meta: {
                model: this.model,
                latency_ms: 0 // Set by Agent class
            }
        };
    }
}
exports.OpenAIProvider = OpenAIProvider;
