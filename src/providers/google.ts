
import { GoogleGenAI } from '@google/genai';
import { LLMProvider, AgentTool, AgentResponse, AgentMessage } from '../types';
import { z, toJSONSchema } from 'zod';
import { readMarkdownFiles, isImageFile, readImageFile } from '../utils/file-utils';


export class GoogleProvider implements LLMProvider {
    private client: GoogleGenAI;
    private model: string;

    constructor(model: string, apiKey?: string) {
        // Google GenAI SDK expects model names in format "models/model-name"
        this.model = model.startsWith('models/') ? model : `models/${model}`;
        const key = apiKey || process.env.GOOGLE_API_KEY;
        this.client = new GoogleGenAI({ apiKey: key });
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
        // 1. Prepare Tools
        let googleTools: any[] | undefined;
        if (tools && tools.length > 0) {
            googleTools = [{
                functionDeclarations: tools.map(t => ({
                    name: t.name,
                    description: t.description,
                    parameters: toJSONSchema(t.parameters as any)
                }))
            }];
        }

        // 2. Prepare Config
        const generateConfig: any = {
            temperature: config?.temperature,
            maxOutputTokens: config?.max_tokens,
            topP: config?.top_p,
            tools: googleTools,
        };

        if (config?.googleSearch) {
            const searchTool = { googleSearch: {} };
            if (generateConfig.tools) {
                generateConfig.tools.push(searchTool);
            } else {
                generateConfig.tools = [searchTool];
            }
        }

        if (config?.aspectRatio) {
            generateConfig.aspectRatio = config.aspectRatio;
        }
        if (config?.candidateCount) {
            generateConfig.candidateCount = config.candidateCount;
        }
        if (config?.personGeneration) {
            generateConfig.personGeneration = config.personGeneration;
        }

        if (system) {
            generateConfig.systemInstruction = system;
        }

        if (output_schema) {
            generateConfig.responseMimeType = "application/json";
            generateConfig.responseSchema = toJSONSchema(output_schema as any);
        }

        // 3. Prepare Contents
        let contents: any[];

        if (Array.isArray(prompt)) {
            // Mapping standardized history to Google's format
            contents = prompt.map(m => {
                const parts: any[] = [];
                if (m.role === 'tool') {
                    parts.push({
                        functionResponse: {
                            name: m.name,
                            response: typeof m.content === 'string' ? JSON.parse(m.content) : m.content
                        }
                    });
                    return { role: 'user', parts }; // SDK v2 uses 'user' for function response
                }

                if (m.tool_calls) {
                    for (const tc of m.tool_calls) {
                        parts.push({
                            functionCall: {
                                name: tc.name,
                                args: tc.arguments
                            }
                        });
                    }
                }

                if (m.content) {
                    parts.push({ text: m.content });
                }

                return {
                    role: m.role === 'assistant' ? 'model' : 'user',
                    parts
                };
            });

            // Handle files by appending to the last message if it's from user
            if (files && files.length > 0) {
                const lastMsg = contents[contents.length - 1];
                if (lastMsg && lastMsg.role === 'user') {
                    const hasImages = files.some(f => isImageFile(f));
                    if (hasImages) {
                        for (const file of files) {
                            if (isImageFile(file)) {
                                try {
                                    const base64Data = readImageFile(file);
                                    const ext = file.split('.').pop()?.toLowerCase();
                                    let mimeType = 'image/jpeg';
                                    if (ext === 'png') mimeType = 'image/png';
                                    if (ext === 'webp') mimeType = 'image/webp';
                                    if (ext === 'heic') mimeType = 'image/heic';
                                    if (ext === 'heif') mimeType = 'image/heif';

                                    lastMsg.parts.push({
                                        inlineData: {
                                            mimeType: mimeType,
                                            data: base64Data
                                        }
                                    });
                                } catch (e: any) {
                                    console.warn(`Failed to read image ${file}:`, e);
                                }
                            } else {
                                const textContent = readMarkdownFiles([file]);
                                lastMsg.parts.push({ text: `\n\nReference Context:\n${textContent}` });
                            }
                        }
                    } else {
                        const textContent = readMarkdownFiles(files);
                        lastMsg.parts.push({ text: `\n\nReference Context:\n${textContent}` });
                    }
                }
            }
        } else {
            // String prompt handling
            const hasImages = files?.some(f => isImageFile(f));

            if (files && files.length > 0) {
                if (hasImages) {
                    contents = [{
                        role: 'user',
                        parts: [{ text: prompt }]
                    }];
                    const lastMsg = contents[0];

                    for (const file of files) {
                        if (isImageFile(file)) {
                            try {
                                const base64Data = readImageFile(file);
                                const ext = file.split('.').pop()?.toLowerCase();
                                let mimeType = 'image/jpeg';
                                if (ext === 'png') mimeType = 'image/png';
                                if (ext === 'webp') mimeType = 'image/webp';
                                if (ext === 'heic') mimeType = 'image/heic';
                                if (ext === 'heif') mimeType = 'image/heif';

                                lastMsg.parts.push({
                                    inlineData: {
                                        mimeType: mimeType,
                                        data: base64Data
                                    }
                                });
                            } catch (e: any) {
                                console.warn(`Failed to read image ${file}:`, e);
                            }
                        } else {
                            const textContent = readMarkdownFiles([file]);
                            lastMsg.parts.push({ text: `\n\nReference Context:\n${textContent}` });
                        }
                    }
                } else {
                    const textContent = readMarkdownFiles(files);
                    contents = [{
                        role: 'user',
                        parts: [{ text: `${textContent}\n\n${prompt}` }]
                    }];
                }
            } else {
                contents = [{
                    role: 'user',
                    parts: [{ text: prompt }]
                }];
            }
        }

        // 4. Call API (Streaming)
        const result = await this.client.models.generateContentStream({
            model: this.model,
            contents: contents,
            config: generateConfig
        });

        let fullText = '';
        let toolCalls: any[] = [];
        let usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
        let groundingMetadata: any = undefined;

        for await (const chunk of result) {
            // Log raw chunk for debugging if needed
            // console.log("CHUNK", JSON.stringify(chunk, null, 2));

            // Text
            const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
                fullText += text;
                onToken(text);
            }

            // Tool Calls
            // New SDK usually aggregates or provides them in chunks.
            // We need to check `candidates[0].content.parts` for `functionCall`.
            // Streaming tool calls might be tricky as they come in parts? 
            // Google usually sends the full function call in one chunk or at the end? 
            // Let's inspect the chunk structure via candidates.
            const parts = chunk.candidates?.[0]?.content?.parts;
            if (parts) {
                for (const part of parts) {
                    if (part.functionCall) {
                        // It seems Google sends full function call or we need to accumulate?
                        // Usually it's complete in the response object if stream is done, but in stream?
                        // Let's collect them.
                        toolCalls.push({
                            name: part.functionCall.name,
                            arguments: part.functionCall.args, // Already parsed JSON usually
                            id: 'call_' + Date.now() // Google doesn't always send ID, need to check
                        });
                    }
                }
            }

            // Image Generation Output (inlineData)
            // Check for inlineData in parts which indicates generated images
            if (parts) {
                for (const part of parts) {
                    if (part.inlineData) {
                        const mimeType = part.inlineData.mimeType;
                        const data = part.inlineData.data;
                        // For now, append a markdown image with data URI to fullText so it returns in content
                        // accessible to the user or UI.
                        fullText += `\n![Generated Image](data:${mimeType};base64,${data})\n`;
                    }
                }
            }

            // Usage
            if (chunk.usageMetadata) {
                usage = {
                    input_tokens: chunk.usageMetadata.promptTokenCount || 0,
                    output_tokens: chunk.usageMetadata.candidatesTokenCount || 0,
                    total_tokens: chunk.usageMetadata.totalTokenCount || 0
                };
            }

            // Capture Grounding Metadata
            // It can be in candidates[0].groundingMetadata OR promptFeedback.groundingMetadata (rarely in stream chunks but possible)
            if (chunk.candidates?.[0]?.groundingMetadata) {
                groundingMetadata = { ...groundingMetadata, ...chunk.candidates[0].groundingMetadata };
            }

            // Occasionally, promptFeedback might contain it in some versions/responses
            const promptFeedback = (chunk as any).promptFeedback;
            if (promptFeedback?.groundingMetadata) {
                groundingMetadata = { ...groundingMetadata, ...promptFeedback.groundingMetadata };
            }
        }

        // Final check on the aggregated response if possible, but we are streaming.
        // The SDK's `result.response` promise resolves to the final response object.
        // We can await it to get any final metadata that might have been missed in chunks?
        // However, we want to return as soon as stream ends. Usually the last chunk has the metadata.
        // Let's try to get it from the final response object to be 100% sure we have everything.
        try {
            const finalResponse = await (result as any).response;
            if (finalResponse.promptFeedback?.groundingMetadata) {
                groundingMetadata = { ...groundingMetadata, ...finalResponse.promptFeedback.groundingMetadata };
            }
            // Also check candidates in final response just in case
            if (finalResponse.candidates?.[0]?.groundingMetadata) {
                groundingMetadata = { ...groundingMetadata, ...finalResponse.candidates[0].groundingMetadata };
            }
        } catch (e) {
            // Ignore if response promise fails or isn't available, we rely on chunks then
        }

        // Parse structured output if needed (if not tool call)
        let finalContent: string | object = fullText;
        if (output_schema && !toolCalls.length) {
            try {
                finalContent = JSON.parse(fullText);
            } catch (e) {
                // ignore
            }
        }

        return {
            content: finalContent,
            tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
            usage,
            meta: {
                model: this.model,
                latency_ms: 0,
                groundingMetadata
            }
        };
    }
}
