import OpenAI from 'openai';
import { LLMProvider, AgentTool, AgentResponse, AgentMessage } from '../types';
import { z, toJSONSchema } from 'zod';
import { readMarkdownFiles } from '../utils/file-utils';

export class GrokProvider implements LLMProvider {
    private client: OpenAI;
    private model: string;

    constructor(model: string, apiKey?: string) {
        this.model = model;
        const key = apiKey || process.env.GROK_API_KEY;
        // Grok uses the OpenAI SDK with a custom base URL
        this.client = new OpenAI({
            apiKey: key,
            baseURL: 'https://api.x.ai/v1',
        });
    }

    async generate(
        system: string | undefined,
        prompt: string | AgentMessage[],
        files: string[] | undefined,
        tools: AgentTool[] | undefined,
        config: Record<string, any> | undefined,
        output_schema: z.ZodType<any> | undefined,
        onToken: (token: string) => void
    ): Promise<AgentResponse> {

        // Image generation mode — route to images API instead of chat completions
        if (this.model.includes('imagine')) {
            const promptText = Array.isArray(prompt)
                ? prompt.filter(m => m.role === 'user').map(m => m.content).join('\n')
                : String(prompt);

            let images: any[];

            if (config?.reference_image || config?.image_url) {
                // Image editing — direct JSON request to /v1/images/edits
                // (OpenAI SDK's images.edit() uses multipart/form-data, but x.ai requires JSON)
                const imageUrl = config.reference_image || config.image_url;
                const body = {
                    model: this.model,
                    prompt: promptText,
                    image_url: imageUrl,
                    n: config?.n || 1,
                    response_format: config?.response_format || 'b64_json',
                    ...(config?.aspect_ratio && { aspect_ratio: config.aspect_ratio }),
                };
                const res = await fetch('https://api.x.ai/v1/images/edits', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.client.apiKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(body),
                });
                if (!res.ok) {
                    const errText = await res.text();
                    throw new Error(`Request failed with status ${res.status}: ${errText}`);
                }
                const json = await res.json();
                images = json.data;
            } else {
                // Standard image generation
                const response = await (this.client.images.generate as any)({
                    model: this.model,
                    prompt: promptText,
                    n: config?.n || 1,
                    response_format: config?.response_format || 'b64_json',
                    ...(config?.aspect_ratio && { aspect_ratio: config.aspect_ratio }),
                });
                images = response.data;
            }

            const markdownParts: string[] = images.map((img: any, i: number) => {
                if (img.b64_json) {
                    return `![Generated Image${images.length > 1 ? ` ${i + 1}` : ''}](data:image/png;base64,${img.b64_json})`;
                }
                return `![Generated Image${images.length > 1 ? ` ${i + 1}` : ''}](${img.url})`;
            });

            const content = markdownParts.join('\n\n');
            onToken(content);

            return {
                content,
                usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
                meta: { model: this.model, latency_ms: 0 }
            };
        }

        // 1. Prepare messages
        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
        if (system) {
            messages.push({ role: 'system', content: system });
        }

        if (Array.isArray(prompt)) {
            // Mapping AgentMessage to OpenAI messages (Grok is compatible)
            for (const msg of prompt) {
                if (msg.role === 'user') {
                    messages.push({ role: 'user', content: msg.content });
                } else if (msg.role === 'assistant') {
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
                } else if (msg.role === 'tool') {
                    messages.push({
                        role: 'tool',
                        tool_call_id: msg.tool_call_id!,
                        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
                    });
                }
            }
        } else {
            // Handle files - read markdown files and inject into prompt
            let userContent: string = prompt;

            // Read and append file contents if provided
            if (files && files.length > 0) {
                try {
                    const fileContents = readMarkdownFiles(files);
                    userContent = `${fileContents}\n\n${prompt}`;
                } catch (error: any) {
                    throw new Error(`File reading error: ${error.message}`);
                }
            }

            // Grok might support json_mode, but let's be explicit if schema is requested
            if (output_schema) {
                userContent = `${userContent}\n\nPlease respond with valid JSON.`;
            }

            messages.push({ role: 'user', content: userContent });
        }

        // 2. Prepare Tools
        let openAITools: OpenAI.Chat.ChatCompletionTool[] | undefined;
        if (tools && tools.length > 0) {
            openAITools = tools.map(t => ({
                type: 'function',
                function: {
                    name: t.name,
                    description: t.description,
                    parameters: {} as Record<string, unknown>, // Placeholder
                },
            }));

            // Fill parameters separately to avoid TS2589
            openAITools.forEach((tool, index) => {
                if (tools![index]) {
                    const schema = toJSONSchema(tools![index].parameters as any);
                    tool.function.parameters = schema as Record<string, unknown>;
                }
            });
        }

        // 3. Call API
        const stream = await this.client.chat.completions.create({
            model: this.model,
            messages,
            tools: openAITools,
            tool_choice: openAITools ? 'auto' : undefined,
            stream: true,
            stream_options: { include_usage: true },
            temperature: config?.temperature,
            max_tokens: config?.max_tokens,
            // Grok support for response_format might vary, but json_object is standard in newer openai-compatible APIs
            response_format: output_schema ? { type: 'json_object' } : undefined,
        });


        let fullContent = '';
        let toolCalls: OpenAI.Chat.ChatCompletionChunk.Choice.Delta.ToolCall[] = [];
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
                    } else {
                        // Merge
                        if (tc.function?.name) toolCalls[index].function!.name += tc.function.name;
                        if (tc.function?.arguments) toolCalls[index].function!.arguments += tc.function.arguments;
                    }
                }
            }

            if (chunk.usage) {
                usage = {
                    input_tokens: chunk.usage.prompt_tokens,
                    output_tokens: chunk.usage.completion_tokens,
                    total_tokens: chunk.usage.total_tokens
                };
            }
        }

        // Parse structured output if needed
        let finalContent: string | object = fullContent;
        if (output_schema && !toolCalls.length) {
            try {
                finalContent = JSON.parse(fullContent);
                // Validate
                output_schema.parse(finalContent);
            } catch (e) {
                console.warn("Failed to parse or validate JSON output", e);
            }
        }

        // Map internal tool calls to generic format if needed
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
                latency_ms: 0
            }
        };
    }
}
