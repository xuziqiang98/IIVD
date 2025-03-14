/**
 * @fileoverview 解析助手消息的核心功能模块。
 * 该模块负责将大模型输出的原始字符串解析成结构化的内容块，
 * 包括纯文本内容和工具使用指令。支持流式输出的实时解析。
 */

import {
	AssistantMessageContent,
	TextContent,
	ToolUse,
	ToolParamName,
	toolParamNames,
	toolUseNames,
	ToolUseName,
} from "."

/**
 * 解析助手消息为结构化的内容块。
 * 
 * 该函数使用状态机的方式解析消息，支持以下特性：
 * - 解析纯文本内容
 * - 解析工具使用指令及其参数
 * - 支持流式输出的实时解析
 * - 特殊处理 write_to_file 工具的内容参数
 * 
 * @param {string} assistantMessage - 需要解析的助手消息原始字符串
 * @returns {AssistantMessageContent[]} 解析后的内容块数组，每个元素可能是文本块或工具使用块
 */
export function parseAssistantMessage(assistantMessage: string) {
	let contentBlocks: AssistantMessageContent[] = []
	let currentTextContent: TextContent | undefined = undefined
	let currentTextContentStartIndex = 0
	let currentToolUse: ToolUse | undefined = undefined
	let currentToolUseStartIndex = 0
	let currentParamName: ToolParamName | undefined = undefined
	let currentParamValueStartIndex = 0
	let accumulator = ""

	for (let i = 0; i < assistantMessage.length; i++) {
		const char = assistantMessage[i]
		accumulator += char

		// 检查当前是否正在处理工具使用中的参数
		if (currentToolUse && currentParamName) {
		    // 从参数值开始位置截取到当前位置，获取可能的参数值
		    const currentParamValue = accumulator.slice(currentParamValueStartIndex)
		    // 构造参数的闭合标签，例如 </path>
		    const paramClosingTag = `</${currentParamName}>`
		    
		    // 检查当前累积的内容是否以参数闭合标签结束
		    if (currentParamValue.endsWith(paramClosingTag)) {
		        // 如果找到闭合标签，说明参数值解析完成
		        // 去掉闭合标签，保存参数值到当前工具的参数对象中
		        currentToolUse.params[currentParamName] = currentParamValue.slice(0, -paramClosingTag.length).trim()
		        // 重置参数名，表示当前参数处理完成
		        currentParamName = undefined
		        continue
		    } else {
		        // 如果没有找到闭合标签，说明参数值还在累积中
		        // 继续下一个字符的处理
		        continue
		    }
		}

		// no currentParamName

		// 检查当前是否在处理工具使用
		if (currentToolUse) {
		    // 从工具使用开始位置截取到当前位置，获取完整的工具内容
		    const currentToolValue = accumulator.slice(currentToolUseStartIndex)
		    // 构造工具的闭合标签，例如 </write_to_file>
		    const toolUseClosingTag = `</${currentToolUse.name}>`
		    
		    // 检查是否找到工具的闭合标签
		    if (currentToolValue.endsWith(toolUseClosingTag)) {
		        // 工具使用解析完成
		        currentToolUse.partial = false  // 标记为非部分状态
		        contentBlocks.push(currentToolUse)  // 添加到内容块数组
		        currentToolUse = undefined  // 重置当前工具
		        continue
		    } else {
		        // 如果没有找到工具的闭合标签，检查是否有新的参数开始
		        const possibleParamOpeningTags = toolParamNames.map((name) => `<${name}>`)
		        // 遍历所有可能的参数开始标签
		        for (const paramOpeningTag of possibleParamOpeningTags) {
		            // 检查是否找到新的参数开始标签
		            if (accumulator.endsWith(paramOpeningTag)) {
		                // 找到新参数，设置参数名和值的起始位置
		                currentParamName = paramOpeningTag.slice(1, -1) as ToolParamName
		                currentParamValueStartIndex = accumulator.length
		                break
		            }
		        }

				// there's no current param, and not starting a new param

				// special case for write_to_file where file contents could contain the closing tag, in which case the param would have closed and we end up with the rest of the file contents here. To work around this, we get the string between the starting content tag and the LAST content tag.
				// 定义内容参数名
				const contentParamName: ToolParamName = "content"
				
				// 检查是否是 write_to_file 工具且当前内容以 </content> 结尾
				if (currentToolUse.name === "write_to_file" && accumulator.endsWith(`</${contentParamName}>`)) {
				    // 获取从工具开始到当前位置的所有内容
				    const toolContent = accumulator.slice(currentToolUseStartIndex)
				    const contentStartTag = `<${contentParamName}>`  // <content>
				    const contentEndTag = `</${contentParamName}>`   // </content>
				    
				    // 找到内容的开始和结束位置
				    const contentStartIndex = toolContent.indexOf(contentStartTag) + contentStartTag.length
				    const contentEndIndex = toolContent.lastIndexOf(contentEndTag)
				    
				    // 确保找到了有效的开始和结束标签，且结束标签在开始标签之后
				    if (contentStartIndex !== -1 && contentEndIndex !== -1 && contentEndIndex > contentStartIndex) {
				        // 提取内容并保存到工具参数中
				        currentToolUse.params[contentParamName] = toolContent
				            .slice(contentStartIndex, contentEndIndex)
				            .trim()
				    }
				}

				// partial tool value is accumulating
				continue
			}
		}

		// no currentToolUse

		// 标记是否开始了新的工具使用
		let didStartToolUse = false
		// 生成所有可能的工具开始标签，例如 <write_to_file>, <search_files> 等
		const possibleToolUseOpeningTags = toolUseNames.map((name) => `<${name}>`)
		
		// 遍历所有可能的工具开始标签
		for (const toolUseOpeningTag of possibleToolUseOpeningTags) {
		    // 检查当前累积的内容是否以某个工具的开始标签结束
		    if (accumulator.endsWith(toolUseOpeningTag)) {
		        // 创建新的工具使用对象
		        currentToolUse = {
		            type: "tool_use",
		            name: toolUseOpeningTag.slice(1, -1) as ToolUseName,  // 去掉 <> 获取工具名
		            params: {},  // 初始化空的参数对象
		            partial: true,  // 标记为部分状态，因为工具使用还未结束
		        }
		        // 记录工具内容的开始位置
		        currentToolUseStartIndex = accumulator.length
		    
		        // 如果之前有文本内容，需要处理完成它
		        if (currentTextContent) {
		            currentTextContent.partial = false  // 标记文本为完成状态
		            // 移除文本末尾可能包含的部分工具标签
		            // 例如：如果文本是 "Hello <write"，需要移除 "<write"
		            currentTextContent.content = currentTextContent.content
		                .slice(0, -toolUseOpeningTag.slice(0, -1).length)
		                .trim()
		            contentBlocks.push(currentTextContent)  // 添加到内容块数组
		            currentTextContent = undefined  // 重置文本内容
		        }
		    
		        didStartToolUse = true  // 标记已开始新的工具使用
		        break  // 找到匹配的工具标签后退出循环
		    }
		}

		if (!didStartToolUse) {
			// no tool use, so it must be text either at the beginning or between tools
			if (currentTextContent === undefined) {
				currentTextContentStartIndex = i
			}
			currentTextContent = {
				type: "text",
				content: accumulator.slice(currentTextContentStartIndex).trim(),
				partial: true,
			}
		}
	}

	if (currentToolUse) {
		// stream did not complete tool call, add it as partial
		if (currentParamName) {
			// tool call has a parameter that was not completed
			currentToolUse.params[currentParamName] = accumulator.slice(currentParamValueStartIndex).trim()
		}
		contentBlocks.push(currentToolUse)
	}

	// Note: it doesnt matter if check for currentToolUse or currentTextContent, only one of them will be defined since only one can be partial at a time
	if (currentTextContent) {
		// stream did not complete text content, add it as partial
		contentBlocks.push(currentTextContent)
	}

	return contentBlocks
}
