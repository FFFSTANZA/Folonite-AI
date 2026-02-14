import {
  Button,
  Coordinates,
  Press,
  ComputerToolUseContentBlock,
  ToolResultContentBlock,
  MessageContentType,
  isScreenshotToolUseBlock,
  isUiSnapshotToolUseBlock,
  isCursorPositionToolUseBlock,
  isMoveMouseToolUseBlock,
  isTraceMouseToolUseBlock,
  isClickMouseToolUseBlock,
  isPressMouseToolUseBlock,
  isDragMouseToolUseBlock,
  isScrollToolUseBlock,
  isTypeKeysToolUseBlock,
  isPressKeysToolUseBlock,
  isTypeTextToolUseBlock,
  isWaitToolUseBlock,
  isApplicationToolUseBlock,
  isPasteTextToolUseBlock,
  isReadFileToolUseBlock,
  isInspectUiToolUseBlock,
  isSearchUiToolUseBlock,
  isDetectElementsToolUseBlock,
  isSetOfMarksToolUseBlock,
  isWaitForStabilizationToolUseBlock,
  isPredictActionToolUseBlock,
  isAnalyzeUiToolUseBlock,
  isMultiAgentToolUseBlock,
  isQuickAgentToolUseBlock,
} from '@folonite/shared';
import { Logger } from '@nestjs/common';
import { MultiAgentProcessor } from './multi-agent.processor';
import { handleMultiAgentToolUse } from './agent.multi-agent';

const FOLONITE_DESKTOP_BASE_URL = process.env.FOLONITE_DESKTOP_BASE_URL as string;

export async function handleComputerToolUse(
  block: ComputerToolUseContentBlock,
  logger: Logger,
  multiAgentProcessor?: MultiAgentProcessor,
): Promise<ToolResultContentBlock> {
  logger.debug(
    `Handling computer tool use: ${block.name}, tool_use_id: ${block.id}`,
  );

  // Handle multi-agent tools
  if ((isMultiAgentToolUseBlock(block) || isQuickAgentToolUseBlock(block)) && multiAgentProcessor) {
    return handleMultiAgentToolUse(block, logger, multiAgentProcessor);
  }

  if (isScreenshotToolUseBlock(block)) {
    logger.debug('Processing screenshot request');
    try {
      logger.debug('Taking screenshot');
      const image = await screenshot();
      logger.debug('Screenshot captured successfully');

      return {
        type: MessageContentType.ToolResult,
        tool_use_id: block.id,
        content: [
          {
            type: MessageContentType.Image,
            source: {
              data: image,
              media_type: 'image/png',
              type: 'base64',
            },
          },
        ],
      };
    } catch (error) {
      logger.error(`Screenshot failed: ${error.message}`, error.stack);
      return {
        type: MessageContentType.ToolResult,
        tool_use_id: block.id,
        content: [
          {
            type: MessageContentType.Text,
            text: 'ERROR: Failed to take screenshot',
          },
        ],
        is_error: true,
      };
    }
  }

  if (isUiSnapshotToolUseBlock(block)) {
    logger.debug('Processing UI snapshot request');
    try {
      const snapshot = await uiSnapshot(block.input);
      const content: any[] = [];

      if (snapshot.ocrText) {
        content.push({
          type: MessageContentType.Text,
          text: `OCR (${snapshot.width}x${snapshot.height}):\n${snapshot.ocrText}`,
        });
      }

      content.push({
        type: MessageContentType.Image,
        source: {
          data: snapshot.image,
          media_type: 'image/png',
          type: 'base64',
        },
      });

      return {
        type: MessageContentType.ToolResult,
        tool_use_id: block.id,
        content,
      };
    } catch (error) {
      logger.error(`UI snapshot failed: ${error.message}`, error.stack);
      return {
        type: MessageContentType.ToolResult,
        tool_use_id: block.id,
        content: [
          {
            type: MessageContentType.Text,
            text: 'ERROR: Failed to take UI snapshot',
          },
        ],
        is_error: true,
      };
    }
  }

  if (isInspectUiToolUseBlock(block)) {
    logger.debug('Processing UI inspection request');
    try {
      const uiTree = await inspectUi();

      // Use formatted text if available (more token-efficient)
      const displayText = uiTree.formatted
        ? uiTree.formatted
        : `Current UI State:\n${JSON.stringify(uiTree.tree, null, 2)}`;

      return {
        type: MessageContentType.ToolResult,
        tool_use_id: block.id,
        content: [
          {
            type: MessageContentType.Text,
            text: displayText,
          },
        ],
      };
    } catch (error) {
      logger.error(`UI inspection failed: ${error.message}`, error.stack);
      return {
        type: MessageContentType.ToolResult,
        tool_use_id: block.id,
        content: [
          {
            type: MessageContentType.Text,
            text: 'ERROR: Failed to inspect UI',
          },
        ],
        is_error: true,
      };
    }
  }

  if (isSearchUiToolUseBlock(block)) {
    logger.debug(
      `Processing UI search request: ${block.input.query} (role: ${block.input.role})`,
    );
    try {
      const results = await searchUi(block.input.query, block.input.role);

      // Format results in a more LLM-friendly way
      let displayText: string;
      if (results.count === 0) {
        displayText = `No UI elements found matching "${block.input.query}"${block.input.role ? ` (role: ${block.input.role})` : ''}.`;
      } else {
        const lines: string[] = [
          `Found ${results.count} element(s) matching "${block.input.query}":`,
          '',
        ];

        results.matches.forEach((match: any, index: number) => {
          const score = match.score ? ` (score: ${(match.score * 100).toFixed(0)}%)` : '';
          const matchType = match.matchType ? ` [${match.matchType}]` : '';
          const name = match.name || '[unnamed]';
          const role = match.role || 'unknown';
          const rect = match.rect
            ? ` [${match.rect.x},${match.rect.y} ${match.rect.width}x${match.rect.height}]`
            : '';

          lines.push(`${index + 1}. ${role}: "${name}"${rect}${score}${matchType}`);
        });

        displayText = lines.join('\n');
      }

      return {
        type: MessageContentType.ToolResult,
        tool_use_id: block.id,
        content: [
          {
            type: MessageContentType.Text,
            text: displayText,
          },
        ],
      };
    } catch (error) {
      logger.error(`UI search failed: ${error.message}`, error.stack);
      return {
        type: MessageContentType.ToolResult,
        tool_use_id: block.id,
        content: [
          {
            type: MessageContentType.Text,
            text: 'ERROR: Failed to search UI',
          },
        ],
        is_error: true,
      };
    }
  }

  // New advanced vision-based tools
  if (isDetectElementsToolUseBlock(block)) {
    logger.debug('Processing detect elements request');
    try {
      const result = await detectElements();
      const content: any[] = [
        {
          type: MessageContentType.Text,
          text: `Detected ${result.elementCount} UI elements:\n\n` +
            result.elements.map((e: any, i: number) =>
              `${i + 1}. ${e.type}${e.text ? `: "${e.text}"` : ''} at [${e.center?.x},${e.center?.y}] (confidence: ${(e.confidence * 100).toFixed(0)}%)`
            ).join('\n'),
        },
      ];

      if (result.annotatedImage) {
        content.push({
          type: MessageContentType.Image,
          source: {
            data: result.annotatedImage,
            media_type: 'image/png',
            type: 'base64',
          },
        });
      }

      return {
        type: MessageContentType.ToolResult,
        tool_use_id: block.id,
        content,
      };
    } catch (error) {
      logger.error(`Detect elements failed: ${error.message}`, error.stack);
      return {
        type: MessageContentType.ToolResult,
        tool_use_id: block.id,
        content: [{ type: MessageContentType.Text, text: `ERROR: ${error.message}` }],
        is_error: true,
      };
    }
  }

  if (isSetOfMarksToolUseBlock(block)) {
    logger.debug('Processing Set-of-Marks request');
    try {
      const result = await setOfMarks(block.input.mode);
      const content: any[] = [
        {
          type: MessageContentType.Text,
          text: `Set-of-Marks created with ${result.elementCount} marked elements.\n\n` +
            `Element Map:\n` +
            Object.entries(result.elementMap).map(([id, info]: [string, any]) =>
              `${id}. ${info.type}${info.text ? `: "${info.text}"` : ''} → [${info.coordinates.x},${info.coordinates.y}]`
            ).join('\n') +
            `\n\nLegend: ${Object.entries(result.legend).map(([type, color]) => `${type}=${color}`).join(', ')}`,
        },
      ];

      if (result.annotatedImage) {
        content.push({
          type: MessageContentType.Image,
          source: {
            data: result.annotatedImage,
            media_type: 'image/png',
            type: 'base64',
          },
        });
      }

      return {
        type: MessageContentType.ToolResult,
        tool_use_id: block.id,
        content,
      };
    } catch (error) {
      logger.error(`Set-of-Marks failed: ${error.message}`, error.stack);
      return {
        type: MessageContentType.ToolResult,
        tool_use_id: block.id,
        content: [{ type: MessageContentType.Text, text: `ERROR: ${error.message}` }],
        is_error: true,
      };
    }
  }

  if (isWaitForStabilizationToolUseBlock(block)) {
    logger.debug('Processing wait for stabilization request');
    try {
      const result = await waitForStabilization(block.input.timeout);
      return {
        type: MessageContentType.ToolResult,
        tool_use_id: block.id,
        content: [
          {
            type: MessageContentType.Text,
            text: result.stabilized
              ? `UI stabilized successfully.`
              : `UI did not stabilize within timeout.`,
          },
        ],
      };
    } catch (error) {
      logger.error(`Wait for stabilization failed: ${error.message}`, error.stack);
      return {
        type: MessageContentType.ToolResult,
        tool_use_id: block.id,
        content: [{ type: MessageContentType.Text, text: `ERROR: ${error.message}` }],
        is_error: true,
      };
    }
  }

  if (isPredictActionToolUseBlock(block)) {
    logger.debug(`Processing predict action request: ${block.input.goal}`);
    try {
      const result = await predictAction(block.input.goal);
      const predictions = result.predictions || [];
      return {
        type: MessageContentType.ToolResult,
        tool_use_id: block.id,
        content: [
          {
            type: MessageContentType.Text,
            text: predictions.length > 0
              ? `Predicted actions for "${block.input.goal}":\n\n` +
                predictions.map((p: any, i: number) =>
                  `${i + 1}. ${p.action} → ${p.targetElement || `[${p.coordinates?.x},${p.coordinates?.y}]`}\n` +
                  `   Confidence: ${(p.confidence * 100).toFixed(0)}%\n` +
                  `   Reason: ${p.reason}`
                ).join('\n\n')
              : `No action predictions available for "${block.input.goal}".`,
          },
        ],
      };
    } catch (error) {
      logger.error(`Predict action failed: ${error.message}`, error.stack);
      return {
        type: MessageContentType.ToolResult,
        tool_use_id: block.id,
        content: [{ type: MessageContentType.Text, text: `ERROR: ${error.message}` }],
        is_error: true,
      };
    }
  }

  if (isAnalyzeUiToolUseBlock(block)) {
    logger.debug('Processing analyze UI request');
    try {
      const result = await analyzeUi();
      const content: any[] = [
        {
          type: MessageContentType.Text,
          text: `UI Analysis:\n\n${result.summary}\n\n` +
            `Interactive Elements (${result.interactiveElements.length}):\n` +
            result.interactiveElements.map((e: any) =>
              `- ${e.type}${e.text ? `: "${e.text}"` : ''} at [${e.coordinates?.x},${e.coordinates?.y}]`
            ).join('\n'),
        },
      ];

      if (result.annotatedImage) {
        content.push({
          type: MessageContentType.Image,
          source: {
            data: result.annotatedImage,
            media_type: 'image/png',
            type: 'base64',
          },
        });
      }

      return {
        type: MessageContentType.ToolResult,
        tool_use_id: block.id,
        content,
      };
    } catch (error) {
      logger.error(`Analyze UI failed: ${error.message}`, error.stack);
      return {
        type: MessageContentType.ToolResult,
        tool_use_id: block.id,
        content: [{ type: MessageContentType.Text, text: `ERROR: ${error.message}` }],
        is_error: true,
      };
    }
  }

  if (isCursorPositionToolUseBlock(block)) {
    logger.debug('Processing cursor position request');
    try {
      logger.debug('Getting cursor position');
      const position = await cursorPosition();
      logger.debug(`Cursor position obtained: ${position.x}, ${position.y}`);

      return {
        type: MessageContentType.ToolResult,
        tool_use_id: block.id,
        content: [
          {
            type: MessageContentType.Text,
            text: `Cursor position: ${position.x}, ${position.y}`,
          },
        ],
      };
    } catch (error) {
      logger.error(
        `Getting cursor position failed: ${error.message}`,
        error.stack,
      );
      return {
        type: MessageContentType.ToolResult,
        tool_use_id: block.id,
        content: [
          {
            type: MessageContentType.Text,
            text: 'ERROR: Failed to get cursor position',
          },
        ],
        is_error: true,
      };
    }
  }

  try {
    if (isMoveMouseToolUseBlock(block)) {
      await moveMouse(block.input);
    }
    if (isTraceMouseToolUseBlock(block)) {
      await traceMouse(block.input);
    }
    if (isClickMouseToolUseBlock(block)) {
      await clickMouse(block.input);
    }
    if (isPressMouseToolUseBlock(block)) {
      await pressMouse(block.input);
    }
    if (isDragMouseToolUseBlock(block)) {
      await dragMouse(block.input);
    }
    if (isScrollToolUseBlock(block)) {
      await scroll(block.input);
    }
    if (isTypeKeysToolUseBlock(block)) {
      await typeKeys(block.input);
    }
    if (isPressKeysToolUseBlock(block)) {
      await pressKeys(block.input);
    }
    if (isTypeTextToolUseBlock(block)) {
      await typeText(block.input);
    }
    if (isPasteTextToolUseBlock(block)) {
      await pasteText(block.input);
    }
    if (isWaitToolUseBlock(block)) {
      await wait(block.input);
    }
    if (isApplicationToolUseBlock(block)) {
      await application(block.input);
    }
    if (isReadFileToolUseBlock(block)) {
      logger.debug(`Reading file: ${block.input.path}`);
      const result = await readFile(block.input);

      if (result.success && result.data) {
        // Return document content block
        return {
          type: MessageContentType.ToolResult,
          tool_use_id: block.id,
          content: [
            {
              type: MessageContentType.Document,
              source: {
                type: 'base64',
                media_type: result.mediaType || 'application/octet-stream',
                data: result.data,
              },
              name: result.name || 'file',
              size: result.size,
            },
          ],
        };
      } else {
        // Return error message
        return {
          type: MessageContentType.ToolResult,
          tool_use_id: block.id,
          content: [
            {
              type: MessageContentType.Text,
              text: result.message || 'Error reading file',
            },
          ],
          is_error: true,
        };
      }
    }

    let snapshot: { image: string } | null = null;
    try {
      // Wait before taking snapshot to allow UI to settle
      const delayMs = 750; // 750ms delay
      logger.debug(`Waiting ${delayMs}ms before taking snapshot`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));

      logger.debug('Taking UI snapshot');
      snapshot = await uiSnapshot({ detail: 'low', ocr: false });
      logger.debug('UI snapshot captured successfully');
    } catch (error) {
      logger.error('Failed to take UI snapshot', error);
    }

    logger.debug(`Tool execution successful for tool_use_id: ${block.id}`);
    const toolResult: ToolResultContentBlock = {
      type: MessageContentType.ToolResult,
      tool_use_id: block.id,
      content: [
        {
          type: MessageContentType.Text,
          text: 'Tool executed successfully',
        },
      ],
    };

    if (snapshot) {
      toolResult.content.push({
        type: MessageContentType.Image,
        source: {
          data: snapshot.image,
          media_type: 'image/png',
          type: 'base64',
        },
      });
    }

    return toolResult;
  } catch (error) {
    logger.error(
      `Error executing ${block.name} tool: ${error.message}`,
      error.stack,
    );
    return {
      type: MessageContentType.ToolResult,
      tool_use_id: block.id,
      content: [
        {
          type: MessageContentType.Text,
          text: `Error executing ${block.name} tool: ${error.message}`,
        },
      ],
      is_error: true,
    };
  }
}

async function moveMouse(input: { coordinates: Coordinates }): Promise<void> {
  const { coordinates } = input;
  console.log(
    `Moving mouse to coordinates: [${coordinates.x}, ${coordinates.y}]`,
  );

  try {
    await fetch(`${FOLONITE_DESKTOP_BASE_URL}/computer-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'move_mouse',
        coordinates,
      }),
    });
  } catch (error) {
    console.error('Error in move_mouse action:', error);
    throw error;
  }
}

async function traceMouse(input: {
  path: Coordinates[];
  holdKeys?: string[];
}): Promise<void> {
  const { path, holdKeys } = input;
  console.log(
    `Tracing mouse to path: ${path} ${holdKeys ? `with holdKeys: ${holdKeys}` : ''}`,
  );

  try {
    await fetch(`${FOLONITE_DESKTOP_BASE_URL}/computer-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'trace_mouse',
        path,
        holdKeys,
      }),
    });
  } catch (error) {
    console.error('Error in trace_mouse action:', error);
    throw error;
  }
}

async function clickMouse(input: {
  coordinates?: Coordinates;
  button: Button;
  holdKeys?: string[];
  clickCount: number;
}): Promise<void> {
  const { coordinates, button, holdKeys, clickCount } = input;
  console.log(
    `Clicking mouse ${button} ${clickCount} times ${coordinates ? `at coordinates: [${coordinates.x}, ${coordinates.y}] ` : ''} ${holdKeys ? `with holdKeys: ${holdKeys}` : ''}`,
  );

  try {
    await fetch(`${FOLONITE_DESKTOP_BASE_URL}/computer-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'click_mouse',
        coordinates,
        button,
        holdKeys: holdKeys && holdKeys.length > 0 ? holdKeys : undefined,
        clickCount,
      }),
    });
  } catch (error) {
    console.error('Error in click_mouse action:', error);
    throw error;
  }
}

async function pressMouse(input: {
  coordinates?: Coordinates;
  button: Button;
  press: Press;
}): Promise<void> {
  const { coordinates, button, press } = input;
  console.log(
    `Pressing mouse ${button} ${press} ${coordinates ? `at coordinates: [${coordinates.x}, ${coordinates.y}]` : ''}`,
  );

  try {
    await fetch(`${FOLONITE_DESKTOP_BASE_URL}/computer-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'press_mouse',
        coordinates,
        button,
        press,
      }),
    });
  } catch (error) {
    console.error('Error in press_mouse action:', error);
    throw error;
  }
}

async function dragMouse(input: {
  path: Coordinates[];
  button: Button;
  holdKeys?: string[];
}): Promise<void> {
  const { path, button, holdKeys } = input;
  console.log(
    `Dragging mouse to path: ${path} ${holdKeys ? `with holdKeys: ${holdKeys}` : ''}`,
  );

  try {
    await fetch(`${FOLONITE_DESKTOP_BASE_URL}/computer-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'drag_mouse',
        path,
        button,
        holdKeys: holdKeys && holdKeys.length > 0 ? holdKeys : undefined,
      }),
    });
  } catch (error) {
    console.error('Error in drag_mouse action:', error);
    throw error;
  }
}

async function scroll(input: {
  coordinates?: Coordinates;
  direction: 'up' | 'down' | 'left' | 'right';
  scrollCount: number;
  holdKeys?: string[];
}): Promise<void> {
  const { coordinates, direction, scrollCount, holdKeys } = input;
  console.log(
    `Scrolling ${direction} ${scrollCount} times ${coordinates ? `at coordinates: [${coordinates.x}, ${coordinates.y}]` : ''}`,
  );

  try {
    await fetch(`${FOLONITE_DESKTOP_BASE_URL}/computer-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'scroll',
        coordinates,
        direction,
        scrollCount,
        holdKeys: holdKeys && holdKeys.length > 0 ? holdKeys : undefined,
      }),
    });
  } catch (error) {
    console.error('Error in scroll action:', error);
    throw error;
  }
}

async function typeKeys(input: {
  keys: string[];
  delay?: number;
}): Promise<void> {
  const { keys, delay } = input;
  console.log(`Typing keys: ${keys}`);

  try {
    await fetch(`${FOLONITE_DESKTOP_BASE_URL}/computer-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'type_keys',
        keys,
        delay,
      }),
    });
  } catch (error) {
    console.error('Error in type_keys action:', error);
    throw error;
  }
}

async function pressKeys(input: {
  keys: string[];
  press: Press;
}): Promise<void> {
  const { keys, press } = input;
  console.log(`Pressing keys: ${keys}`);

  try {
    await fetch(`${FOLONITE_DESKTOP_BASE_URL}/computer-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'press_keys',
        keys,
        press,
      }),
    });
  } catch (error) {
    console.error('Error in press_keys action:', error);
    throw error;
  }
}

async function typeText(input: {
  text: string;
  delay?: number;
}): Promise<void> {
  const { text, delay } = input;
  console.log(`Typing text: ${text}`);

  try {
    await fetch(`${FOLONITE_DESKTOP_BASE_URL}/computer-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'type_text',
        text,
        delay,
      }),
    });
  } catch (error) {
    console.error('Error in type_text action:', error);
    throw error;
  }
}

async function pasteText(input: { text: string }): Promise<void> {
  const { text } = input;
  console.log(`Pasting text: ${text}`);

  try {
    await fetch(`${FOLONITE_DESKTOP_BASE_URL}/computer-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'paste_text',
        text,
      }),
    });
  } catch (error) {
    console.error('Error in paste_text action:', error);
    throw error;
  }
}

async function wait(input: { duration: number }): Promise<void> {
  const { duration } = input;
  console.log(`Waiting for ${duration}ms`);

  try {
    await fetch(`${FOLONITE_DESKTOP_BASE_URL}/computer-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'wait',
        duration,
      }),
    });
  } catch (error) {
    console.error('Error in wait action:', error);
    throw error;
  }
}

async function cursorPosition(): Promise<Coordinates> {
  console.log('Getting cursor position');

  try {
    const response = await fetch(`${FOLONITE_DESKTOP_BASE_URL}/computer-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'cursor_position',
      }),
    });

    const data = await response.json();
    return { x: data.x, y: data.y };
  } catch (error) {
    console.error('Error in cursor_position action:', error);
    throw error;
  }
}

async function screenshot(): Promise<string> {
  console.log('Taking screenshot');

  try {
    const requestBody = {
      action: 'screenshot',
    };

    const response = await fetch(`${FOLONITE_DESKTOP_BASE_URL}/computer-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`Failed to take screenshot: ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.image) {
      throw new Error('Failed to take screenshot: No image data received');
    }

    return data.image; // Base64 encoded image
  } catch (error) {
    console.error('Error in screenshot action:', error);
    throw error;
  }
}

async function uiSnapshot(input: {
  detail?: 'low' | 'high';
  ocr?: boolean;
}): Promise<{ image: string; ocrText?: string; width: number; height: number }> {
  console.log('Taking UI snapshot');

  try {
    const requestBody = {
      action: 'ui_snapshot',
      detail: input.detail,
      ocr: input.ocr,
    };

    const response = await fetch(`${FOLONITE_DESKTOP_BASE_URL}/computer-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`Failed to take UI snapshot: ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.image) {
      throw new Error('Failed to take UI snapshot: No image data received');
    }

    return data;
  } catch (error) {
    console.error('Error in ui_snapshot action:', error);
    throw error;
  }
}

async function inspectUi(): Promise<any> {
  console.log('Inspecting UI');

  try {
    const response = await fetch(`${FOLONITE_DESKTOP_BASE_URL}/computer-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'inspect_ui',
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to inspect UI: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error in inspect_ui action:', error);
    throw error;
  }
}

async function searchUi(query: string, role?: string): Promise<any> {
  console.log(`Searching UI for: ${query}`);

  try {
    const response = await fetch(`${FOLONITE_DESKTOP_BASE_URL}/computer-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'search_ui',
        query,
        role,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to search UI: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error in search_ui action:', error);
    throw error;
  }
}

async function application(input: { application: string }): Promise<void> {
  const { application } = input;
  console.log(`Opening application: ${application}`);

  try {
    await fetch(`${FOLONITE_DESKTOP_BASE_URL}/computer-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'application',
        application,
      }),
    });
  } catch (error) {
    console.error('Error in application action:', error);
    throw error;
  }
}

async function readFile(input: { path: string }): Promise<{
  success: boolean;
  data?: string;
  name?: string;
  size?: number;
  mediaType?: string;
  message?: string;
}> {
  const { path } = input;
  console.log(`Reading file: ${path}`);

  try {
    const response = await fetch(`${FOLONITE_DESKTOP_BASE_URL}/computer-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'read_file',
        path,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to read file: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error in read_file action:', error);
    return {
      success: false,
      message: `Error reading file: ${error.message}`,
    };
  }
}

export async function writeFile(input: {
  path: string;
  content: string;
}): Promise<{ success: boolean; message?: string }> {
  const { path, content } = input;
  console.log(`Writing file: ${path}`);

  try {
    // Content is always base64 encoded
    const base64Data = content;

    const response = await fetch(`${FOLONITE_DESKTOP_BASE_URL}/computer-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'write_file',
        path,
        data: base64Data,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to write file: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error in write_file action:', error);
    return {
      success: false,
      message: `Error writing file: ${error.message}`,
    };
  }
}

// New advanced vision-based API functions

async function detectElements(): Promise<any> {
  console.log('Detecting UI elements');
  try {
    const response = await fetch(`${FOLONITE_DESKTOP_BASE_URL}/computer-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'detect_elements' }),
    });
    if (!response.ok) {
      throw new Error(`Failed to detect elements: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error in detect_elements:', error);
    throw error;
  }
}

async function setOfMarks(mode?: string): Promise<any> {
  console.log(`Creating Set-of-Marks (mode: ${mode || 'auto'})`);
  try {
    const response = await fetch(`${FOLONITE_DESKTOP_BASE_URL}/computer-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'set_of_marks',
        mode,
      }),
    });
    if (!response.ok) {
      throw new Error(`Failed to create Set-of-Marks: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error in set_of_marks:', error);
    throw error;
  }
}

async function waitForStabilization(timeout?: number): Promise<any> {
  console.log(`Waiting for UI stabilization (timeout: ${timeout || 5000}ms)`);
  try {
    const response = await fetch(`${FOLONITE_DESKTOP_BASE_URL}/computer-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'wait_for_stabilization',
        timeout,
      }),
    });
    if (!response.ok) {
      throw new Error(`Failed to wait for stabilization: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error in wait_for_stabilization:', error);
    throw error;
  }
}

async function predictAction(goal: string): Promise<any> {
  console.log(`Predicting actions for goal: ${goal}`);
  try {
    const response = await fetch(`${FOLONITE_DESKTOP_BASE_URL}/computer-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'predict_action',
        goal,
      }),
    });
    if (!response.ok) {
      throw new Error(`Failed to predict actions: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error in predict_action:', error);
    throw error;
  }
}

async function analyzeUi(): Promise<any> {
  console.log('Analyzing UI');
  try {
    const response = await fetch(`${FOLONITE_DESKTOP_BASE_URL}/computer-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'analyze_ui' }),
    });
    if (!response.ok) {
      throw new Error(`Failed to analyze UI: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error in analyze_ui:', error);
    throw error;
  }
}
