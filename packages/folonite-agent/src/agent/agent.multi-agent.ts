import {
  ComputerToolUseContentBlock,
  ToolResultContentBlock,
  MessageContentType,
  isMultiAgentToolUseBlock,
  isQuickAgentToolUseBlock,
} from '@folonite/shared';
import { Logger } from '@nestjs/common';
import { MultiAgentProcessor } from './multi-agent.processor';

/**
 * Handle multi-agent tool use blocks
 */
export async function handleMultiAgentToolUse(
  block: ComputerToolUseContentBlock,
  logger: Logger,
  multiAgentProcessor: MultiAgentProcessor,
): Promise<ToolResultContentBlock> {
  // Handle multi_agent_execute
  if (isMultiAgentToolUseBlock(block)) {
    logger.debug(`Processing multi-agent execute: ${block.input.goal}`);
    
    try {
      const result = await multiAgentProcessor.processTask(
        block.input.goal,
        `task-${Date.now()}`, // Generate task ID
        {
          requirePlan: block.input.require_plan ?? true,
          maxSteps: block.input.max_steps ?? 10,
        }
      );

      const content: any[] = [
        {
          type: MessageContentType.Text,
          text: result.finalOutput +
            `\n\n[Execution: ${result.executions.length} steps, ` +
            `${result.totalTokens} tokens, ` +
            `${result.totalTime}ms]`,
        },
      ];

      // Include any screenshots from desktop/browser agents
      for (const exec of result.executions) {
        if ((exec.agent === 'desktop' || exec.agent === 'browser') && exec.output.includes('base64')) {
          const base64Match = exec.output.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/);
          if (base64Match) {
            content.push({
              type: MessageContentType.Image,
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: base64Match[1],
              },
            });
          }
        }
      }

      return {
        type: MessageContentType.ToolResult,
        tool_use_id: block.id,
        content,
      };
    } catch (error) {
      logger.error(`Multi-agent execution failed: ${error.message}`, error.stack);
      return {
        type: MessageContentType.ToolResult,
        tool_use_id: block.id,
        content: [
          {
            type: MessageContentType.Text,
            text: `ERROR: Multi-agent execution failed: ${error.message}`,
          },
        ],
        is_error: true,
      };
    }
  }

  // Handle quick_agent_execute
  if (isQuickAgentToolUseBlock(block)) {
    logger.debug(`Processing quick agent execute: ${block.input.task}`);
    
    try {
      const result = await multiAgentProcessor.quickExecute(
        block.input.task,
        {
          taskId: `quick-${Date.now()}`,
        }
      );

      return {
        type: MessageContentType.ToolResult,
        tool_use_id: block.id,
        content: [
          {
            type: MessageContentType.Text,
            text: result.success
              ? `${result.output}\n\n[${result.tokens} tokens]`
              : `ERROR: ${result.output}`,
          },
        ],
        is_error: !result.success,
      };
    } catch (error) {
      logger.error(`Quick agent execution failed: ${error.message}`, error.stack);
      return {
        type: MessageContentType.ToolResult,
        tool_use_id: block.id,
        content: [
          {
            type: MessageContentType.Text,
            text: `ERROR: Quick agent execution failed: ${error.message}`,
          },
        ],
        is_error: true,
      };
    }
  }

  // Should not reach here
  return {
    type: MessageContentType.ToolResult,
    tool_use_id: block.id,
    content: [
      {
        type: MessageContentType.Text,
        text: 'ERROR: Unknown multi-agent tool',
      },
    ],
    is_error: true,
  };
}
