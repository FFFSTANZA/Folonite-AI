import { Injectable, Logger } from '@nestjs/common';
import { AgentContext } from './agent-orchestrator.service';
import {
  MessageContentType,
} from '@folonite/shared';

/**
 * Desktop Agent - Specialized for UI automation
 * 
 * Token-efficient design:
 * - Uses Set-of-Marks for precise targeting
 * - Returns compact UI state descriptions
 * - Caches screenshot references (not full images)
 * - Prioritizes accessibility tree over pixels when possible
 */
export interface DesktopResult {
  success: boolean;
  action: 'screenshot' | 'click' | 'type' | 'scroll' | 'key' | 'inspect' | 'search' | 'set_of_marks';
  screenshot?: string; // base64 if needed
  uiState?: UiState;
  error?: string;
  metadata: {
    elementsFound?: number;
    executionTime: number;
    usedVision: boolean;
    tokenEstimate: number;
  };
}

export interface UiState {
  elements: UiElement[];
  activeWindow?: string;
  cursorPosition?: { x: number; y: number };
  summary: string;
  annotatedImage?: string;
  elementMap?: Record<string, { type: string; coordinates: { x: number; y: number } }>;
}

export interface UiElement {
  id?: string;
  type: string;
  text?: string;
  coordinates: { x: number; y: number };
  bbox?: { x: number; y: number; width: number; height: number };
  confidence?: number;
}

@Injectable()
export class DesktopAgent {
  private readonly logger = new Logger(DesktopAgent.name);
  private lastUiState: UiState | null = null;
  private screenshotCounter = 0;

  /**
   * Execute a desktop operation
   */
  async execute(
    intent: string,
    context: AgentContext,
  ): Promise<DesktopResult> {
    const startTime = Date.now();
    const action = this.parseIntent(intent);

    this.logger.debug(`DesktopAgent executing: ${action.type}`);

    try {
      switch (action.type) {
        case 'screenshot':
          return await this.takeScreenshot(startTime);
        
        case 'click':
          return await this.click(action.target!, action.coordinates, startTime);
        
        case 'type':
          return await this.typeText(action.text!, action.target, startTime);
        
        case 'inspect':
          return await this.inspectUi(startTime);
        
        case 'search':
          return await this.searchUi(action.query!, action.role, startTime);
        
        case 'set_of_marks':
          return await this.createSetOfMarks(action.mode, startTime);
        
        case 'scroll':
          return await this.scroll(action.direction!, action.amount, startTime);
        
        case 'key':
          return await this.pressKey(action.key!, startTime);
        
        default:
          return {
            success: false,
            action: 'screenshot',
            error: `Unknown action: ${action.type}`,
            metadata: {
              executionTime: Date.now() - startTime,
              usedVision: false,
              tokenEstimate: 50,
            },
          };
      }
    } catch (error) {
      return {
        success: false,
        action: action.type || 'screenshot',
        error: error.message,
        metadata: {
          executionTime: Date.now() - startTime,
          usedVision: false,
          tokenEstimate: 50,
        },
      };
    }
  }

  /**
   * Parse intent into structured action
   */
  private parseIntent(intent: string): {
    type: 'screenshot' | 'click' | 'type' | 'scroll' | 'key' | 'inspect' | 'search' | 'set_of_marks';
    target?: string;
    coordinates?: { x: number; y: number };
    text?: string;
    query?: string;
    role?: string;
    direction?: 'up' | 'down' | 'left' | 'right';
    amount?: number;
    key?: string;
    mode?: 'axtree' | 'vision' | 'hybrid';
  } {
    const lower = intent.toLowerCase();

    // Screenshot
    if (lower.match(/screenshot|screen|capture|snap/)) {
      return { type: 'screenshot' };
    }

    // Set of marks
    if (lower.match(/set of marks|som|mark|numbered|label/)) {
      const mode = lower.includes('axtree') ? 'axtree' : 
                   lower.includes('vision') ? 'vision' : 'hybrid';
      return { type: 'set_of_marks', mode };
    }

    // Click
    const clickMatch = lower.match(/click(?:\s+on)?\s+(?:the\s+)?(.+)/);
    if (clickMatch) {
      const target = clickMatch[1].trim();
      // Check if it's coordinates
      const coordMatch = target.match(/(\d+)\s*,\s*(\d+)/);
      if (coordMatch) {
        return {
          type: 'click',
          coordinates: { x: parseInt(coordMatch[1]), y: parseInt(coordMatch[2]) },
        };
      }
      return { type: 'click', target };
    }

    // Type
    const typeMatch = lower.match(/type\s+["']([^"']+)["'](?:\s+in(?:to)?\s+(.+))?/);
    if (typeMatch) {
      return {
        type: 'type',
        text: typeMatch[1],
        target: typeMatch[2]?.trim(),
      };
    }

    // Search UI
    const searchMatch = lower.match(/search\s+(?:for\s+)?["']?([^"']+)["']?(?:\s+(?:with\s+)?role\s+(\w+))?/);
    if (searchMatch) {
      return {
        type: 'search',
        query: searchMatch[1],
        role: searchMatch[2],
      };
    }

    // Inspect
    if (lower.match(/inspect|analyze ui|ui state|what.*see|current state/)) {
      return { type: 'inspect' };
    }

    // Scroll
    const scrollMatch = lower.match(/scroll\s+(up|down|left|right)(?:\s+(\d+))?/);
    if (scrollMatch) {
      return {
        type: 'scroll',
        direction: scrollMatch[1] as any,
        amount: scrollMatch[2] ? parseInt(scrollMatch[2]) : 3,
      };
    }

    // Key press
    const keyMatch = lower.match(/press\s+(?:key\s+)?(\w+)|hit\s+(\w+)|(?:ctrl|alt|shift|cmd)\s*\+\s*\w+/);
    if (keyMatch) {
      return { type: 'key', key: keyMatch[1] || keyMatch[2] || intent };
    }

    // Default to inspect
    return { type: 'inspect' };
  }

  /**
   * Take screenshot with optional analysis
   */
  private async takeScreenshot(startTime: number): Promise<DesktopResult> {
    const response = await this.callDesktopService({
      action: 'screenshot',
    });

    if (!response.success) {
      return {
        success: false,
        action: 'screenshot',
        error: response.error,
        metadata: {
          executionTime: Date.now() - startTime,
          usedVision: true,
          tokenEstimate: 1000, // Screenshot tokens
        },
      };
    }

    this.screenshotCounter++;

    return {
      success: true,
      action: 'screenshot',
      screenshot: response.image,
      uiState: {
        elements: [],
        summary: `Screenshot captured (#${this.screenshotCounter})`,
      },
      metadata: {
        executionTime: Date.now() - startTime,
        usedVision: true,
        tokenEstimate: 1000,
      },
    };
  }

  /**
   * Click on element or coordinates
   */
  private async click(
    target: string,
    coordinates?: { x: number; y: number },
    startTime?: number,
  ): Promise<DesktopResult> {
    let clickAction: any;

    if (coordinates) {
      clickAction = {
        action: 'click',
        coordinates,
      };
    } else {
      // Try to find element first
      const searchResult = await this.callDesktopService({
        action: 'search_ui',
        query: target,
      });

      if (searchResult.success && searchResult.matches?.length > 0) {
        const match = searchResult.matches[0];
        clickAction = {
          action: 'click',
          coordinates: match.center || { x: match.rect?.x, y: match.rect?.y },
        };
      } else {
        return {
          success: false,
          action: 'click',
          error: `Element not found: ${target}`,
          metadata: {
            executionTime: Date.now() - (startTime || Date.now()),
            usedVision: false,
            tokenEstimate: 100,
          },
        };
      }
    }

    const response = await this.callDesktopService(clickAction);

    return {
      success: response.success,
      action: 'click',
      error: response.error,
      metadata: {
        executionTime: Date.now() - (startTime || Date.now()),
        usedVision: false,
        tokenEstimate: 50,
      },
    };
  }

  /**
   * Type text
   */
  private async typeText(
    text: string,
    target?: string,
    startTime?: number,
  ): Promise<DesktopResult> {
    // If target specified, click first
    if (target) {
      await this.click(target, undefined, startTime);
    }

    const response = await this.callDesktopService({
      action: 'type',
      text: text,
    });

    return {
      success: response.success,
      action: 'type',
      error: response.error,
      metadata: {
        executionTime: Date.now() - (startTime || Date.now()),
        usedVision: false,
        tokenEstimate: 50,
      },
    };
  }

  /**
   * Inspect UI state
   */
  private async inspectUi(startTime?: number): Promise<DesktopResult> {
    const response = await this.callDesktopService({
      action: 'inspect_ui',
    });

    if (!response.success) {
      return {
        success: false,
        action: 'inspect',
        error: response.error,
        metadata: {
          executionTime: Date.now() - (startTime || Date.now()),
          usedVision: false,
          tokenEstimate: 100,
        },
      };
    }

    // Format compact UI state
    const uiState: UiState = {
      elements: this.formatElementsCompact(response.elements || []),
      activeWindow: response.activeWindow,
      summary: this.generateUiSummary(response.elements || [], response.tree),
    };

    this.lastUiState = uiState;

    return {
      success: true,
      action: 'inspect',
      uiState,
      metadata: {
        elementsFound: uiState.elements.length,
        executionTime: Date.now() - (startTime || Date.now()),
        usedVision: false,
        tokenEstimate: this.estimateTokens(uiState),
      },
    };
  }

  /**
   * Search UI elements
   */
  private async searchUi(
    query: string,
    role?: string,
    startTime?: number,
  ): Promise<DesktopResult> {
    const response = await this.callDesktopService({
      action: 'search_ui',
      query,
      role,
    });

    if (!response.success) {
      return {
        success: false,
        action: 'search',
        error: response.error,
        metadata: {
          executionTime: Date.now() - (startTime || Date.now()),
          usedVision: false,
          tokenEstimate: 50,
        },
      };
    }

    const matches = response.matches || [];
    const uiState: UiState = {
      elements: matches.slice(0, 5).map((m: any) => ({
        type: m.role || m.type || 'element',
        text: m.name,
        coordinates: m.center || { x: m.rect?.x, y: m.rect?.y },
        confidence: m.score,
      })),
      summary: `Found ${matches.length} matches for "${query}"`,
    };

    return {
      success: true,
      action: 'search',
      uiState,
      metadata: {
        elementsFound: matches.length,
        executionTime: Date.now() - (startTime || Date.now()),
        usedVision: false,
        tokenEstimate: this.estimateTokens(uiState),
      },
    };
  }

  /**
   * Create Set-of-Marks annotation
   */
  private async createSetOfMarks(
    mode?: 'axtree' | 'vision' | 'hybrid',
    startTime?: number,
  ): Promise<DesktopResult> {
    const response = await this.callDesktopService({
      action: 'set_of_marks',
      mode: mode || 'hybrid',
    });

    if (!response.success) {
      return {
        success: false,
        action: 'set_of_marks',
        error: response.error,
        metadata: {
          executionTime: Date.now() - (startTime || Date.now()),
          usedVision: true,
          tokenEstimate: 100,
        },
      };
    }

    const uiState: UiState = {
      elements: [],
      summary: `Set-of-Marks created with ${response.elementCount} elements`,
      annotatedImage: response.annotatedImage,
      elementMap: response.elementMap,
    };

    return {
      success: true,
      action: 'set_of_marks',
      uiState,
      screenshot: response.annotatedImage,
      metadata: {
        elementsFound: response.elementCount,
        executionTime: Date.now() - (startTime || Date.now()),
        usedVision: true,
        tokenEstimate: 1500, // Image + text
      },
    };
  }

  /**
   * Scroll in a direction
   */
  private async scroll(
    direction: 'up' | 'down' | 'left' | 'right',
    amount?: number,
    startTime?: number,
  ): Promise<DesktopResult> {
    const scrollAmount = (amount || 3) * 100;
    
    const deltaMap: Record<string, { x: number; y: number }> = {
      up: { x: 0, y: -scrollAmount },
      down: { x: 0, y: scrollAmount },
      left: { x: -scrollAmount, y: 0 },
      right: { x: scrollAmount, y: 0 },
    };

    const response = await this.callDesktopService({
      action: 'scroll',
      ...deltaMap[direction],
    });

    return {
      success: response.success,
      action: 'scroll',
      error: response.error,
      metadata: {
        executionTime: Date.now() - (startTime || Date.now()),
        usedVision: false,
        tokenEstimate: 30,
      },
    };
  }

  /**
   * Press a key
   */
  private async pressKey(key: string, startTime?: number): Promise<DesktopResult> {
    const response = await this.callDesktopService({
      action: 'key',
      text: key,
    });

    return {
      success: response.success,
      action: 'key',
      error: response.error,
      metadata: {
        executionTime: Date.now() - (startTime || Date.now()),
        usedVision: false,
        tokenEstimate: 30,
      },
    };
  }

  /**
   * Call desktop service
   */
  private async callDesktopService(payload: any): Promise<any> {
    const desktopUrl = process.env.FOLONITE_DESKTOP_URL || 'http://localhost:3002';
    
    const response = await fetch(`${desktopUrl}/computer-use/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Desktop service error: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Format elements compactly
   */
  private formatElementsCompact(elements: any[]): UiElement[] {
    return elements
      .filter(e => e.role && !['panel', 'group', 'layer', 'filler'].includes(e.role))
      .slice(0, 20)
      .map(e => ({
        id: e.id,
        type: this.compactRole(e.role),
        text: e.name?.substring(0, 30),
        coordinates: e.center || { x: e.rect?.x, y: e.rect?.y },
        bbox: e.rect,
      }));
  }

  /**
   * Compact role names
   */
  private compactRole(role: string): string {
    const map: Record<string, string> = {
      'push button': 'btn',
      'button': 'btn',
      'text entry': 'input',
      'entry': 'input',
      'check box': 'chk',
      'radio button': 'radio',
      'combo box': 'dropdown',
      'menu item': 'item',
      'scroll bar': 'scroll',
    };
    return map[role] || role;
  }

  /**
   * Generate UI summary
   */
  private generateUiSummary(elements: any[], tree?: any[]): string {
    const interactive = elements.filter(e => 
      ['button', 'push button', 'text entry', 'check box', 'menu'].some(
        r => e.role?.includes(r)
      )
    );

    const byType = interactive.reduce((acc, e) => {
      const type = this.compactRole(e.role);
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const typeSummary = Object.entries(byType)
      .map(([type, count]: [string, number]) => `${count} ${type}${count > 1 ? 's' : ''}`)
      .join(', ');

    return `UI: ${typeSummary || 'no interactive elements'}`;
  }

  /**
   * Estimate token count for UI state
   */
  private estimateTokens(uiState: UiState): number {
    let tokens = 50; // Base
    tokens += uiState.elements.length * 20;
    tokens += uiState.summary.length / 4;
    if (uiState.annotatedImage) {
      tokens += 1000; // Image estimate
    }
    return Math.round(tokens);
  }
}
