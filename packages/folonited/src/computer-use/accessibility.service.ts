import { Injectable, Logger } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execAsync = promisify(exec);

interface UiElement {
  id: string;
  name: string;
  role: string;
  description?: string;
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  states?: string[];
  depth: number;
  path: string;
  children?: UiElement[];
}

interface UiTreeResult {
  type: string;
  tree: UiElement[];
  source: string;
  timestamp: string;
  resolution?: string;
}

interface CachedUiState {
  result: UiTreeResult;
  expiresAt: number;
}

@Injectable()
export class AccessibilityService {
  private readonly logger = new Logger(AccessibilityService.name);
  private cache: CachedUiState | null = null;
  private readonly CACHE_TTL_MS = 2000; // 2 second cache for UI state

  /**
   * Get the UI tree with caching support
   */
  async getUiTree(useCache = true): Promise<UiTreeResult> {
    // Check cache
    if (useCache && this.cache && this.cache.expiresAt > Date.now()) {
      this.logger.debug('Returning cached UI state');
      return this.cache.result;
    }

    const result = await this.fetchUiTree();

    // Update cache
    this.cache = {
      result,
      expiresAt: Date.now() + this.CACHE_TTL_MS,
    };

    return result;
  }

  /**
   * Clear the UI state cache
   */
  clearCache(): void {
    this.cache = null;
    this.logger.debug('UI state cache cleared');
  }

  /**
   * Search for UI elements matching the query
   */
  async searchElements(
    query: string,
    role?: string,
    options: { maxResults?: number; useCache?: boolean } = {},
  ): Promise<{ count: number; matches: UiElement[]; source: string }> {
    const { maxResults = 50, useCache = true } = options;
    const uiTree = await this.getUiTree(useCache);

    const matches: UiElement[] = [];
    const searchLower = query.toLowerCase();
    const targetRole = role?.toLowerCase();

    const searchNode = (node: UiElement, parentPath = ''): void => {
      if (matches.length >= maxResults) return;

      const currentPath = parentPath
        ? `${parentPath} > ${node.name || node.role}`
        : node.name || node.role;

      const nodeName = (node.name || '').toLowerCase();
      const nodeRole = (node.role || '').toLowerCase();

      const nameMatch = nodeName.includes(searchLower);
      const roleMatch = !targetRole || nodeRole === targetRole;

      if (nameMatch && roleMatch && node.name) {
        matches.push({
          ...node,
          path: currentPath,
        });
      }

      if (node.children) {
        node.children.forEach((child) => searchNode(child, currentPath));
      }
    };

    uiTree.tree.forEach((node) => searchNode(node));

    return {
      count: matches.length,
      matches,
      source: uiTree.source,
    };
  }

  /**
   * Find an element by its approximate coordinates
   */
  async findElementAt(
    x: number,
    y: number,
    useCache = true,
  ): Promise<UiElement | null> {
    const uiTree = await this.getUiTree(useCache);

    let bestMatch: UiElement | null = null;
    let smallestArea = Infinity;

    const checkNode = (node: UiElement): void => {
      if (!node.rect) return;

      const { x: rx, y: ry, width, height } = node.rect;

      // Check if point is inside this element
      if (x >= rx && x <= rx + width && y >= ry && y <= ry + height) {
        const area = width * height;
        // Prefer smaller elements (more specific)
        if (area < smallestArea) {
          smallestArea = area;
          bestMatch = node;
        }
      }

      if (node.children) {
        node.children.forEach((child) => checkNode(child));
      }
    };

    uiTree.tree.forEach((node) => checkNode(node));
    return bestMatch;
  }

  /**
   * Get all interactive elements (buttons, links, inputs, etc.)
   */
  async getInteractiveElements(
    useCache = true,
  ): Promise<{ count: number; elements: UiElement[]; source: string }> {
    const uiTree = await this.getUiTree(useCache);

    const interactiveRoles = [
      'push button',
      'button',
      'link',
      'text',
      'entry',
      'check box',
      'radio button',
      'combo box',
      'list item',
      'menu item',
      'tab',
      'scroll bar',
      'slider',
      'spin button',
      'toggle button',
      'menu',
      'list',
      'tree',
      'table',
      'cell',
    ];

    const elements: UiElement[] = [];
    const maxElements = 100;

    const collectInteractive = (node: UiElement, parentPath = ''): void => {
      if (elements.length >= maxElements) return;

      const currentPath = parentPath
        ? `${parentPath} > ${node.name || node.role}`
        : node.name || node.role;

      const nodeRole = (node.role || '').toLowerCase();

      if (
        interactiveRoles.some(
          (r) => nodeRole === r || nodeRole.includes(r),
        ) &&
        node.name
      ) {
        elements.push({
          ...node,
          path: currentPath,
        });
      }

      if (node.children) {
        node.children.forEach((child) => collectInteractive(child, currentPath));
      }
    };

    uiTree.tree.forEach((node) => collectInteractive(node));

    return {
      count: elements.length,
      elements,
      source: uiTree.source,
    };
  }

  /**
   * Format the UI tree as a compact text representation for LLM consumption
   */
  async formatTreeForLlm(useCache = true): Promise<string> {
    const uiTree = await this.getUiTree(useCache);

    if (uiTree.tree.length === 0) {
      return 'No UI elements found. Desktop may be empty or accessibility services unavailable.';
    }

    const lines: string[] = [];
    lines.push(`UI State (source: ${uiTree.source}):`);
    lines.push('');

    const formatNode = (node: UiElement, indent = 0): void => {
      const prefix = '  '.repeat(indent);
      const name = node.name || '[unnamed]';
      const role = node.role || 'unknown';
      const rect = node.rect
        ? `(${node.rect.x},${node.rect.y} ${node.rect.width}x${node.rect.height})`
        : '';

      // Truncate long names
      const displayName =
        name.length > 50 ? name.substring(0, 47) + '...' : name;

      lines.push(`${prefix}[${role}] "${displayName}" ${rect}`);

      if (node.children && indent < 3) {
        // Limit depth to keep output manageable
        node.children.forEach((child) => formatNode(child, indent + 1));
      }
    };

    uiTree.tree.forEach((node) => formatNode(node));

    return lines.join('\n');
  }

  private async fetchUiTree(): Promise<UiTreeResult> {
    try {
      const scriptPath = path.join(process.cwd(), 'scripts/dump_ax_tree.py');
      const { stdout } = await execAsync(
        `sudo -u user DISPLAY=:0.0 python3 "${scriptPath}"`,
        { timeout: 15000 },
      );

      const data = JSON.parse(stdout);

      if (data.type === 'axtree' && Array.isArray(data.applications)) {
        return {
          type: 'axtree',
          tree: this.normalizeElements(data.applications),
          source: 'pyatspi',
          timestamp: new Date().toISOString(),
        };
      }

      if (data.type === 'x11tree' && Array.isArray(data.applications)) {
        return {
          type: 'axtree',
          tree: this.normalizeElements(data.applications),
          source: 'x11',
          timestamp: new Date().toISOString(),
        };
      }

      // Fallback to wmctrl
      return await this.fetchFromWmctrl();
    } catch (error) {
      this.logger.warn(`Failed to fetch UI tree: ${error.message}`);
      return await this.fetchFromWmctrl();
    }
  }

  private async fetchFromWmctrl(): Promise<UiTreeResult> {
    try {
      const { stdout } = await execAsync('sudo -u user wmctrl -lG', {
        timeout: 5000,
      });

      const windows = stdout
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => {
          const parts = line.split(/\s+/);
          const title = parts.slice(7).join(' ');
          return {
            id: `win-${parts[0]}`,
            name: title,
            role: 'window',
            description: undefined,
            rect: {
              x: parseInt(parts[2], 10) || 0,
              y: parseInt(parts[3], 10) || 0,
              width: parseInt(parts[4], 10) || 0,
              height: parseInt(parts[5], 10) || 0,
            },
            states: [],
            depth: 0,
            path: title,
            children: [],
          };
        })
        .filter((w) => w.name);

      return {
        type: 'axtree',
        tree: windows,
        source: 'wmctrl',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`wmctrl fallback failed: ${error.message}`);
      return {
        type: 'axtree',
        tree: [],
        source: 'empty',
        timestamp: new Date().toISOString(),
      };
    }
  }

  private normalizeElements(nodes: any[], depth = 0, parentId = ''): UiElement[] {
    if (!Array.isArray(nodes)) return [];

    const results: UiElement[] = [];

    for (let index = 0; index < nodes.length; index++) {
      const node = nodes[index];
      if (!node || typeof node !== 'object') continue;

      const id = parentId ? `${parentId}.${index}` : `${index}`;

      const element: UiElement = {
        id,
        name: (node.name || node.title || '').toString(),
        role: (node.role || 'unknown').toString(),
        description: node.description,
        rect: node.rect || null,
        states: Array.isArray(node.states) ? node.states : [],
        depth,
        path: (node.name || node.title || node.role || 'unknown').toString(),
        children: this.normalizeElements(
          node.children,
          depth + 1,
          id,
        ),
      };

      results.push(element);
    }

    return results;
  }
}
