import { Anthropic } from "@anthropic-ai/sdk"
import { Stream as AnthropicStream } from "@anthropic-ai/sdk/streaming"
import { CacheControlEphemeral } from "@anthropic-ai/sdk/resources"
import { BetaThinkingConfigParam } from "@anthropic-ai/sdk/resources/beta"
import {
	anthropicDefaultModelId,
	AnthropicModelId,
	anthropicModels,
	ApiHandlerOptions,
	ModelInfo,
} from "../../shared/api"
import { ApiHandler, SingleCompletionHandler } from "../index"
import { ApiStream } from "../transform/stream"

const ANTHROPIC_DEFAULT_TEMPERATURE = 0

export class AnthropicHandler implements ApiHandler, SingleCompletionHandler {
	private options: ApiHandlerOptions
	private client: Anthropic

	constructor(options: ApiHandlerOptions) {
		this.options = options

		this.client = new Anthropic({
			apiKey: this.options.apiKey,
			baseURL: this.options.anthropicBaseUrl || undefined,
		})
	}

	async *createMessage(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): ApiStream {
		let stream: AnthropicStream<Anthropic.Messages.RawMessageStreamEvent>
		const cacheControl: CacheControlEphemeral = { type: "ephemeral" }
		let { id: modelId, temperature, maxTokens, thinking } = this.getModel()

		switch (modelId) {
			case "claude-3-7-sonnet-20250219":
			case "claude-3-5-sonnet-20241022":
			case "claude-3-5-haiku-20241022":
			case "claude-3-opus-20240229":
			case "claude-3-haiku-20240307": {
				/**
				 * The latest message will be the new user message, one before will
				 * be the assistant message from a previous request, and the user message before that will be a previously cached user message. So we need to mark the latest user message as ephemeral to cache it for the next request, and mark the second to last user message as ephemeral to let the server know the last message to retrieve from the cache for the current request..
				 */
				const userMsgIndices = messages.reduce(
					(acc, msg, index) => (msg.role === "user" ? [...acc, index] : acc),
					[] as number[],
				)

				const lastUserMsgIndex = userMsgIndices[userMsgIndices.length - 1] ?? -1
				const secondLastMsgUserIndex = userMsgIndices[userMsgIndices.length - 2] ?? -1

				stream = await this.client.messages.create(
					{
						model: modelId,
						max_tokens: maxTokens,
						temperature,
						thinking,
						// Setting cache breakpoint for system prompt so new tasks can reuse it.
						system: [{ text: systemPrompt, type: "text", cache_control: cacheControl }],
						messages: messages.map((message, index) => {
							if (index === lastUserMsgIndex || index === secondLastMsgUserIndex) {
								return {
									...message,
									content:
										typeof message.content === "string"
											? [{ type: "text", text: message.content, cache_control: cacheControl }]
											: message.content.map((content, contentIndex) =>
													contentIndex === message.content.length - 1
														? { ...content, cache_control: cacheControl }
														: content,
												),
								}
							}
							return message
						}),
						// tools, // cache breakpoints go from tools > system > messages, and since tools dont change, we can just set the breakpoint at the end of system (this avoids having to set a breakpoint at the end of tools which by itself does not meet min requirements for haiku caching)
						// tool_choice: { type: "auto" },
						// tools: tools,
						stream: true,
					},
					(() => {
						// prompt caching: https://x.com/alexalbert__/status/1823751995901272068
						// https://github.com/anthropics/anthropic-sdk-typescript?tab=readme-ov-file#default-headers
						// https://github.com/anthropics/anthropic-sdk-typescript/commit/c920b77fc67bd839bfeb6716ceab9d7c9bbe7393
						switch (modelId) {
							case "claude-3-5-sonnet-20241022":
							case "claude-3-5-haiku-20241022":
							case "claude-3-opus-20240229":
							case "claude-3-haiku-20240307":
								return {
									headers: { "anthropic-beta": "prompt-caching-2024-07-31" },
								}
							default:
								return undefined
						}
					})(),
				)
				break
			}
			default: {
				stream = (await this.client.messages.create({
					model: modelId,
					max_tokens: maxTokens,
					temperature,
					system: [{ text: systemPrompt, type: "text" }],
					messages,
					// tools,
					// tool_choice: { type: "auto" },
					stream: true,
				})) as any
				break
			}
		}

		for await (const chunk of stream) {
			switch (chunk.type) {
				case "message_start":
					// Tells us cache reads/writes/input/output.
					const usage = chunk.message.usage

					yield {
						type: "usage",
						inputTokens: usage.input_tokens || 0,
						outputTokens: usage.output_tokens || 0,
						cacheWriteTokens: usage.cache_creation_input_tokens || undefined,
						cacheReadTokens: usage.cache_read_input_tokens || undefined,
					}

					break
				case "message_delta":
					// Tells us stop_reason, stop_sequence, and output tokens
					// along the way and at the end of the message.
					yield {
						type: "usage",
						inputTokens: 0,
						outputTokens: chunk.usage.output_tokens || 0,
					}

					break
				case "message_stop":
					// No usage data, just an indicator that the message is done.
					break
				case "content_block_start":
					switch (chunk.content_block.type) {
						case "thinking":
							// We may receive multiple text blocks, in which
							// case just insert a line break between them.
							if (chunk.index > 0) {
								yield { type: "reasoning", text: "\n" }
							}

							yield { type: "reasoning", text: chunk.content_block.thinking }
							break
						case "text":
							// We may receive multiple text blocks, in which
							// case just insert a line break between them.
							if (chunk.index > 0) {
								yield { type: "text", text: "\n" }
							}

							yield { type: "text", text: chunk.content_block.text }
							break
					}
					break
				case "content_block_delta":
					switch (chunk.delta.type) {
						case "thinking_delta":
							yield { type: "reasoning", text: chunk.delta.thinking }
							break
						case "text_delta":
							yield { type: "text", text: chunk.delta.text }
							break
					}

					break
				case "content_block_stop":
					break
			}
		}
	}

	getModel() {
		const modelId = this.options.apiModelId
		let temperature = this.options.modelTemperature ?? ANTHROPIC_DEFAULT_TEMPERATURE
		let thinking: BetaThinkingConfigParam | undefined = undefined

		if (modelId && modelId in anthropicModels) {
			let id = modelId as AnthropicModelId
			const info: ModelInfo = anthropicModels[id]

			// The `:thinking` variant is a virtual identifier for the
			// `claude-3-7-sonnet-20250219` model with a thinking budget.
			// We can handle this more elegantly in the future.
			if (id === "claude-3-7-sonnet-20250219:thinking") {
				id = "claude-3-7-sonnet-20250219"
			}

			const maxTokens = this.options.modelMaxTokens || info.maxTokens || 8192

			if (info.thinking) {
				// Anthropic "Thinking" models require a temperature of 1.0.
				temperature = 1.0

				// Clamp the thinking budget to be at most 80% of max tokens and at
				// least 1024 tokens.
				const maxBudgetTokens = Math.floor(maxTokens * 0.8)
				const budgetTokens = Math.max(
					Math.min(this.options.modelMaxThinkingTokens ?? maxBudgetTokens, maxBudgetTokens),
					1024,
				)

				thinking = { type: "enabled", budget_tokens: budgetTokens }
			}

			return { id, info, temperature, maxTokens, thinking }
		}

		const id = anthropicDefaultModelId
		const info: ModelInfo = anthropicModels[id]
		const maxTokens = this.options.modelMaxTokens || info.maxTokens || 8192

		return { id, info, temperature, maxTokens, thinking }
	}

	async completePrompt(prompt: string) {
		let { id: modelId, temperature, maxTokens, thinking } = this.getModel()

		const message = await this.client.messages.create({
			model: modelId,
			max_tokens: maxTokens,
			temperature,
			thinking,
			messages: [{ role: "user", content: prompt }],
			stream: false,
		})

		const content = message.content.find(({ type }) => type === "text")
		return content?.type === "text" ? content.text : ""
	}
}
