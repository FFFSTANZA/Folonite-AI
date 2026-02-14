import { Injectable, Logger } from '@nestjs/common';
import { AgentContext } from './agent-orchestrator.service';

/**
 * Browser Agent - Specialized for web automation
 * 
 * Uses Playwright for reliable browser automation
 * Token-efficient DOM extraction (only key elements)
 */
export interface BrowserResult {
  success: boolean;
  action: 'navigate' | 'click' | 'type' | 'extract' | 'screenshot';
  url?: string;
  title?: string;
  content?: string;
  elements?: BrowserElement[];
  screenshot?: string;
  error?: string;
  metadata: {
    loadTime?: number;
    elementCount?: number;
    executionTime: number;
    tokenEstimate: number;
  };
}

export interface BrowserElement {
  tag: string;
  text?: string;
  id?: string;
  class?: string;
  href?: string;
  selector: string;
  boundingBox?: { x: number; y: number; width: number; height: number };
}

@Injectable()
export class BrowserAgent {
  private readonly logger = new Logger(BrowserAgent.name);
  private currentUrl?: string;

  /**
   * Execute browser operation
   */
  async execute(
    intent: string,
    context: AgentContext,
  ): Promise<BrowserResult> {
    const startTime = Date.now();
    const action = this.parseIntent(intent);

    this.logger.debug(`BrowserAgent executing: ${action.type}`);

    try {
      switch (action.type) {
        case 'navigate':
          return await this.navigate(action.url!, startTime);
        
        case 'click':
          return await this.clickElement(action.selector!, startTime);
        
        case 'type':
          return await this.typeText(action.selector!, action.text!, startTime);
        
        case 'extract':
          return await this.extractContent(action.selector, startTime);
        
        case 'screenshot':
          return await this.takeScreenshot(startTime);
        
        default:
          return {
            success: false,
            action: 'navigate',
            error: `Unknown action: ${action.type}`,
            metadata: {
              executionTime: Date.now() - startTime,
              tokenEstimate: 50,
            },
          };
      }
    } catch (error) {
      return {
        success: false,
        action: action.type || 'navigate',
        error: error.message,
        metadata: {
          executionTime: Date.now() - startTime,
          tokenEstimate: 50,
        },
      };
    }
  }

  /**
   * Parse intent into structured action
   */
  private parseIntent(intent: string): {
    type: 'navigate' | 'click' | 'type' | 'extract' | 'screenshot';
    url?: string;
    selector?: string;
    text?: string;
  } {
    const lower = intent.toLowerCase();

    // Navigate
    const navMatch = intent.match(/(?:navigate\s+to|go\s+to|open|visit)\s+(.+)/i);
    if (navMatch) {
      let url = navMatch[1].trim();
      if (!url.startsWith('http')) {
        url = 'https://' + url;
      }
      return { type: 'navigate', url };
    }

    // Click
    const clickMatch = intent.match(/click\s+(?:on\s+)?(.+)/i);
    if (clickMatch) {
      return {
        type: 'click',
        selector: this.parseSelector(clickMatch[1]),
      };
    }

    // Type
    const typeMatch = intent.match(/type\s+["']([^"']+)["']\s+(?:in|into)\s+(.+)/i);
    if (typeMatch) {
      return {
        type: 'type',
        text: typeMatch[1],
        selector: this.parseSelector(typeMatch[2]),
      };
    }

    // Extract/Get content
    if (lower.match(/extract|get|read|scrape|content/)) {
      const selectorMatch = intent.match(/(?:from|of|on)\s+(.+)/i);
      return {
        type: 'extract',
        selector: selectorMatch ? this.parseSelector(selectorMatch[1]) : undefined,
      };
    }

    // Screenshot
    if (lower.match(/screenshot|capture/)) {
      return { type: 'screenshot' };
    }

    return { type: 'extract' };
  }

  /**
   * Parse natural language selector to CSS selector
   */
  private parseSelector(desc: string): string {
    const lower = desc.toLowerCase().trim();

    // Link with text
    if (lower.startsWith('link') || lower.includes('button')) {
      const text = desc.replace(/^(link|button)\s*/i, '').replace(/["']/g, '');
      return `text="${text}"`;
    }

    // Input/field
    if (lower.includes('input') || lower.includes('field') || lower.includes('box')) {
      const label = desc.replace(/.*?(?:input|field|box)\s*/i, '').replace(/["']/g, '');
      return `input[placeholder*="${label}"], input[name*="${label}"], label:has-text("${label}") + input`;
    }

    // By ID
    if (lower.startsWith('#')) {
      return desc;
    }

    // By class
    if (lower.startsWith('.')) {
      return desc;
    }

    // Default: text match
    return `text="${desc.replace(/["']/g, '')}"`;
  }

  /**
   * Navigate to URL
   */
  private async navigate(url: string, startTime: number): Promise<BrowserResult> {
    const response = await this.callBrowserService({
      action: 'navigate',
      url,
    });

    if (response.success) {
      this.currentUrl = url;
    }

    return {
      success: response.success,
      action: 'navigate',
      url: response.url,
      title: response.title,
      content: this.formatPageContent(response),
      elements: this.extractKeyElements(response.elements),
      error: response.error,
      metadata: {
        loadTime: response.loadTime,
        elementCount: response.elements?.length,
        executionTime: Date.now() - startTime,
        tokenEstimate: this.estimatePageTokens(response),
      },
    };
  }

  /**
   * Click element
   */
  private async clickElement(selector: string, startTime: number): Promise<BrowserResult> {
    const response = await this.callBrowserService({
      action: 'click',
      selector,
    });

    return {
      success: response.success,
      action: 'click',
      url: response.url,
      title: response.title,
      content: response.textContent?.substring(0, 500),
      error: response.error,
      metadata: {
        executionTime: Date.now() - startTime,
        tokenEstimate: 200,
      },
    };
  }

  /**
   * Type text into element
   */
  private async typeText(
    selector: string,
    text: string,
    startTime: number,
  ): Promise<BrowserResult> {
    const response = await this.callBrowserService({
      action: 'type',
      selector,
      text,
    });

    return {
      success: response.success,
      action: 'type',
      error: response.error,
      metadata: {
        executionTime: Date.now() - startTime,
        tokenEstimate: 50,
      },
    };
  }

  /**
   * Extract content from page
   */
  private async extractContent(
    selector?: string,
    startTime?: number,
  ): Promise<BrowserResult> {
    const response = await this.callBrowserService({
      action: 'extract',
      selector,
    });

    return {
      success: response.success,
      action: 'extract',
      content: this.formatExtractedContent(response.content),
      error: response.error,
      metadata: {
        executionTime: Date.now() - (startTime || Date.now()),
        tokenEstimate: response.content?.length / 4 || 100,
      },
    };
  }

  /**
   * Take screenshot
   */
  private async takeScreenshot(startTime: number): Promise<BrowserResult> {
    const response = await this.callBrowserService({
      action: 'screenshot',
    });

    return {
      success: response.success,
      action: 'screenshot',
      screenshot: response.screenshot,
      error: response.error,
      metadata: {
        executionTime: Date.now() - startTime,
        tokenEstimate: 1000, // Image tokens
      },
    };
  }

  /**
   * Call browser service
   */
  private async callBrowserService(payload: any): Promise<any> {
    // Check if there's a browser service running, otherwise use desktop
    const browserUrl = process.env.FOLONITE_BROWSER_URL || 'http://localhost:3003';
    
    try {
      const response = await fetch(`${browserUrl}/browser/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Browser service error: ${response.statusText}`);
      }

      return response.json();
    } catch (error) {
      // Fallback: browser automation not available
      return {
        success: false,
        error: 'Browser service not available. Use desktop agent for web browsing.',
      };
    }
  }

  /**
   * Format page content compactly
   */
  private formatPageContent(response: any): string {
    const parts: string[] = [];
    
    if (response.title) {
      parts.push(`Title: ${response.title}`);
    }
    
    if (response.headings) {
      const mainHeadings = response.headings.slice(0, 5);
      parts.push(`Headings: ${mainHeadings.join(' | ')}`);
    }
    
    if (response.links) {
      const keyLinks = response.links
        .filter((l: any) => l.text && l.text.length < 50)
        .slice(0, 10)
        .map((l: any) => l.text);
      parts.push(`Links: ${keyLinks.join(', ')}`);
    }

    if (response.textContent) {
      const text = response.textContent
        .replace(/\s+/g, ' ')
        .substring(0, 300);
      parts.push(`Content: ${text}...`);
    }

    return parts.join('\n');
  }

  /**
   * Extract key interactive elements
   */
  private extractKeyElements(elements: any[]): BrowserElement[] {
    if (!elements) return [];

    return elements
      .filter((e: any) => 
        ['a', 'button', 'input', 'select', 'textarea'].includes(e.tag) ||
        e.role === 'button' ||
        e.role === 'link'
      )
      .slice(0, 15)
      .map((e: any) => ({
        tag: e.tag,
        text: e.text?.substring(0, 30),
        id: e.id,
        class: e.class?.split(' ').slice(0, 3).join(' '),
        href: e.href,
        selector: e.selector || `${e.tag}${e.id ? `#${e.id}` : ''}`,
      }));
  }

  /**
   * Format extracted content
   */
  private formatExtractedContent(content: any): string {
    if (typeof content === 'string') {
      return content.substring(0, 1000);
    }
    
    if (Array.isArray(content)) {
      return content.map(item => {
        if (typeof item === 'object') {
          return Object.entries(item)
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ');
        }
        return String(item);
      }).join('\n');
    }

    return JSON.stringify(content, null, 2).substring(0, 1000);
  }

  /**
   * Estimate token count for page
   */
  private estimatePageTokens(response: any): number {
    let tokens = 100; // Base
    
    if (response.title) tokens += response.title.length / 4;
    if (response.textContent) tokens += Math.min(response.textContent.length / 4, 500);
    if (response.elements) tokens += response.elements.length * 10;
    
    return Math.round(tokens);
  }
}
