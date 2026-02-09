# Agent Pulse

**Agent Pulse** is a lightweight, native-first, event-driven framework for building agentic AI applications in JavaScript and TypeScript.

It is designed to be "Zero Boilerplate," getting you from install to running agent in seconds, while supporting powerful patterns like streaming, tool execution, and workflow chaining.

## Features

- **Native First**: Built directly on official SDKs (`@google/genai`, `openai`).
- **Tree-Shakeable**: Modular architecture allows you to import only what you need.
- **Event-Driven**: Emit `token` events for streaming and `response` events for logic.
- **Zero Boilerplate**: Simple `config`-based initialization.
- **Auto Tool Execution**: Automatically executes tools and returns results for "Intent Detection" patterns.
- **Provider Agnostic**: Easily switch between OpenAI, Google Gemini, and Grok by injecting different providers.

## Installation

```bash
npm install agent-pulse
```

## Quick Start
### 1. Setup Environment
Create a `.env` file with your API keys. You only need the key for the provider you intend to use.

```env
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=AIza...
GROK_API_KEY=...
```

### 2. Basic Chat Bot (Streaming)

```typescript
import { Agent, openAI } from 'agent-pulse';
import * as dotenv from 'dotenv';
dotenv.config();

// Option A: Use environment variables (OPENAI_API_KEY)
const agent = new Agent({
  name: 'my-bot',
  provider: new openAI('gpt-4o'),
  system: 'You are a helpful assistant.'
});

// Option B: Pass API key directly (Recommended for Serverless/Vercel)
const agentWithKey = new Agent({
  name: 'secure-bot',
  provider: new openAI('gpt-4o', process.env.CUSTOM_KEY_NAME || 'your-key'),
  system: 'You are a helpful assistant.'
});

// Real-time typing effect
agent.on('token', (chunk) => {
  process.stdout.write(chunk);
});

// Final logic
agent.on('response', (result) => {
  console.log('\nDone!', result.meta);
});

await agent.run('Hello!');
```

### 3. Chatbots & history (Multi-Turn)

To run a chatbot with memory, maintain a history array and pass it to `agent.run()`.

```typescript
import { Agent, openAI } from 'agent-pulse';

const agent = new Agent({
  name: 'chatbot',
  provider: new openAI('gpt-4o'),
  system: 'You are a helpful assistant.'
});

const history = [
  { role: 'user', content: 'What is the capital of France?' },
  { role: 'assistant', content: 'The capital of France is Paris.' },
  { role: 'user', content: 'And what is its famous tower?' }
];

const result = await agent.run(history);
console.log(result.content); // "The famous tower in Paris is the Eiffel Tower."

// To continue the conversation, append the new assistant response:
history.push({ role: 'assistant', content: result.content });
```

## Modular Imports & Providers

Agent Pulse exports aliases for common providers to make your code clean:

```typescript
import { Agent, openAI, google, grok } from 'agent-pulse';

// OpenAI
const bot1 = new Agent({
    name: 'gpt-bot',
    provider: new openAI('gpt-4o')
});

// Google Gemini
const bot2 = new Agent({
    name: 'gemini-bot',
    provider: new google('gemini-1.5-pro')
});

// xAI / Grok
const bot3 = new Agent({
    name: 'grok-bot',
    provider: new grok('grok-beta')
});
```

You can also import the classes directly if you prefer:
```typescript
import { Agent, OpenAIProvider, GoogleProvider, GrokProvider } from 'agent-pulse';
```

## Configuration

| Option | Type | Description |
|---|---|---|
| `name` | string | Unique identifier for debugging. |
| `provider` | LLMProvider | An instance of a provider class (e.g., `new openAI('model', 'optional_key')`). |
| `system` | string | System instructions. |
| `prompt` | string | Base prompt template (optional). |
| `files` | string[] | Array of file paths or content strings to include in context. |
| `tools` | Array | List of executable tools with Zod schemas. |
| `output_schema` | ZodSchema | Enforce structured JSON output (if supported by provider). |
| `saveFunction` | function | Async function to persist messages (`(msg: AgentMessage) => Promise<void>`). |
| `max_tool_iterations` | number | Max iterations for tool call loops (default: 1). |

## Events

Agent Pulse is built on `EventEmitter`. You can listen to the following events:

| Event Name | Description | Payload Structure |
| :--- | :--- | :--- |
| `start` | Fired when `agent.run()` is called. | `{ timestamp: number, inputContext: string\|any[] }` |
| `token` | Fired for each chunk of text generated (streaming). | `string` |
| `tool_start` | Fired before a tool is executed. | `{ tool: string, arguments: any }` |
| `tool_end` | Fired after a tool has executed. | `{ tool: string, result: any }` |
| `response` | Fired when generation is complete. | `AgentResponse` object |
| `error` | Fired when an error occurs. | `{ error_key: string, message: string, details?: any }` |
| `log` | General logging event. | `{ level: string, message: string }` |

## Response Structure & Token Usage

The `response` event and the `agent.run()` promise resolve to a standardized `AgentResponse` object:

```typescript
{
    content: string | object, // The Markdown text, parsed JSON, or tool result (if iterations=1)
    message?: string,          // The original LLM text response (useful when a tool is also called)
    usage: {
        input_tokens: number,
        output_tokens: number,
        total_tokens: number
    },
    meta: {
        model: string,
        latency_ms: number
    }
}
```

> [!NOTE]
> If an LLM responds with both text and a tool call (common in Gemini), `content` stays consistent with legacy behavior (holding the tool result), while the new `message` field preserves the original LLM text.

You can access token usage stats from the `usage` property.

## Error Codes


The `error` event payload contains an `error_key` to help you handle specific failure scenarios:

- `network_error`: Connection failures or timeouts.
- `auth_error`: Invalid API keys or permission issues.
- `json_error`: Failure parsing structured outputs.
- `execution_error`: General runtime errors during agent execution.
- `retry_error`: Max retries exceeded.

### Handling Errors

```typescript
agent.on('error', (err) => {
  console.error(`[${err.error_key}]`, err.message);
});
```

## Usage Examples

### 1. Tool Use & Intent Detection

Use tools to perform actions or structured data extraction. You can handle the results in two ways: via **events** (for monitoring/side-effects) or via **return values** (for control flow).

#### Option A: Control Flow (Async/Await)
Best for logic. The tool's return value becomes the agent's final response if the agent decides the task is complete.

```typescript
import { Agent, google } from 'agent-pulse';
import { z } from 'zod';

const summaryTool = {
  name: 'summarize_trip_intent',
  description: 'Call when you have destination and date.',
  parameters: z.object({ destination: z.string(), date: z.string() }),
  execute: async ({ destination, date }) => {
    // Return a payload. The agent maps this to the final response.
    return { type: 'INTENT_COMPLETE', payload: { destination, date } };
  }
};

const agent = new Agent({
  name: 'intake',
  provider: new google('gemini-1.5-pro'),
  tools: [summaryTool]
});

// Await the result directly
const result = await agent.run("I want to go to Paris next week.");

if (result.content?.type === 'INTENT_COMPLETE') {
  console.log("✅ Intent Detected via Return:", result.content.payload);
  // Proceed with your app logic...
}
```

#### Option B: Handling Text + Tool (Gemini Style)
When using models like Gemini that often provide a text explanation *and* a tool call in one turn, use the `message` field to access the text.

```typescript
const result = await agent.run("Tell me a joke and then get the weather.");

// If weatherTool was called:
console.log(result.message); // "Sure! Here's a joke: ... Now, let me get the weather for you."
console.log(result.content); // { temp: 20, unit: 'celsius' } (The tool result)
```

#### Option C: Events (Side Effects)
Best for logging, UI updates, or real-time monitoring.

```typescript
// Listen to 'tool_start' and 'tool_end' for visibility
agent.on('tool_start', (evt) => {
  console.log(`[UI] ⏳ Executing tool: ${evt.tool}...`);
});

agent.on('tool_end', (evt) => {
  console.log(`[UI] ✔️ Tool finished:`, evt.result);
});
```


### 2. Multi-Turn Tool Calling (Autonomous Agent)

By setting `max_tool_iterations`, the agent can autonomously call tools, receive results, and reason until it has a final answer.

```typescript
const agent = new Agent({
  name: 'researcher',
  provider: new openAI('gpt-4o'),
  tools: [weatherTool, searchTool],
  max_tool_iterations: 5 // Allow up to 5 loop turns
});

const result = await agent.run("What's the weather like in London today?");
// Agent calls weatherTool -> receives result -> reasons -> returns final text.
```

### 3. Manual Tool Responses (Client-Side Loops)

If your agent is running on a server but needs the **client** to perform an action (like opening a modal or reading a local file), you can return a UI instruction and then send the result back in the next `run()` call.

#### OpenAI Example
```typescript
const agent = new Agent({
  name: 'account-mgr',
  provider: new openAI('gpt-4o'),
  tools: [requestConfirmationTool]
});

// 1. First Run: Agent requests a tool call
const res = await agent.run("Delete my account ACC-123");

// 2. Client handles the tool call manually (e.g., shows a modal)
const confirmed = await myUi.showModal(res.content.payload);

// 3. Second Run: Send the result back to the agent
const final = await agent.run([
  { role: 'user', content: "Delete my account ACC-123" },
  { 
    role: 'assistant', 
    content: null, 
    tool_calls: [{ id: 'call_123', name: 'request_delete', arguments: { id: 'ACC-123' } }] 
  },
  { 
    role: 'tool', 
    tool_call_id: 'call_123', 
    content: JSON.stringify({ confirmed }) 
  }
]);
```

#### Gemini Example
The same pattern works for Gemini! While Google's API uses a different internal format (`functionResponse`), **Agent Pulse** handles the mapping for you. Simply use the standardized `tool` role:

```typescript
const agent = new Agent({
  name: 'gemini-agent',
  provider: new google('gemini-1.5-flash')
});

const final = await agent.run([
  { role: 'user', content: "Search for weather" },
  { 
    role: 'assistant', 
    content: null, 
    tool_calls: [{ id: 'call_abc', name: 'get_weather', arguments: { loc: 'London' } }] 
  },
  { 
    role: 'tool', 
    tool_call_id: 'call_abc', 
    name: 'get_weather', // Required for Gemini
    content: JSON.stringify({ temp: 20 }) 
  }
]);
```

### 4. File Input

Pass file content context to the agent.

```typescript
import { Agent, openAI } from 'agent-pulse';

const agent = new Agent({
  name: 'analyst',
  provider: new openAI('gpt-4o'),
  // You can pass file paths (if handled by environment) or load content yourself
  files: ['/path/to/data.txt'] 
});
```

### 4. Structured Output (JSON)

Enforce a specific JSON schema for the response.

```typescript
import { Agent, google } from 'agent-pulse';
import { z } from 'zod';

const recipeSchema = z.object({
  title: z.string(),
  ingredients: z.array(z.string()),
  steps: z.array(z.string())
});

const agent = new Agent({
  name: 'chef',
  provider: new google('gemini-1.5-pro'),
  output_schema: recipeSchema
});

agent.on('response', (result) => {
  // result.content will be a typed object
  console.log("Recipe:", result.content); 
});

await agent.run("How do I make pancakes?");
```

### 5. Server-Side Streaming (SSE)

Bridge agent events to a Server-Sent Events stream for frontend consumption (e.g., in Express).

```typescript
import { Agent, openAI, bridgeToSSE, setupSSEHeaders } from 'agent-pulse';
import express from 'express';

const app = express();

app.get('/chat', async (req, res) => {
  setupSSEHeaders(res);

  const agent = new Agent({ 
      name: 'web-bot', 
      provider: new openAI('gpt-4o') 
  });
  
  // Connect agent events to the response stream
  bridgeToSSE(res, agent);

  await agent.run(req.query.prompt);
  // Response ends automatically after agent finishes
});
```

### 6. Google Search Grounding

Enable real-time search results and citations with Google models.

```typescript
import { Agent, google } from 'agent-pulse';

const agent = new Agent({
  name: 'researcher',
  provider: new google('gemini-2.5-flash-lite'),
  config: {
    googleSearch: true
  }
});

agent.on('response', (result) => {
    // Access citation metadata
    if (result.meta.groundingMetadata) {
        console.log('Sources:', result.meta.groundingMetadata);
    }
});

await agent.run("Who won the Super Bowl in 2024?");
```

## Extensibility: Custom Providers

To add a new provider (e.g. Anthropic, Mistral), create a class that implements the `LLMProvider` interface.

```typescript
import { LLMProvider, AgentResponse } from 'agent-pulse/types';

export class MyProvider implements LLMProvider {
  constructor(private modelName: string) {}

  async generate(system, prompt, files, tools, config, schema, onToken) {
     // Implement generation logic
     // Call onToken(chunk) for streaming
     // Return Promise<AgentResponse>
  }
}

// Usage
const agent = new Agent({
    name: 'custom-bot',
    provider: new MyProvider('my-model')
});
```
## To locally link the package

1. Run `npm link` in the agent-pulse directory
2. Run `npm link agent-pulse --legacy-peer-deps` in your project directory

## License

MIT
