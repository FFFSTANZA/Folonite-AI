import { Injectable, Logger } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execAsync = promisify(exec);

// String similarity function for fuzzy matching (Levenshtein-based)
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function stringSimilarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const distance = levenshteinDistance(a.toLowerCase(), b.toLowerCase());
  const maxLength = Math.max(a.length, b.length);
  return maxLength === 0 ? 1 : 1 - distance / maxLength;
}

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
   * Search for UI elements matching the query with fuzzy matching and scoring
   */
  async searchElements(
    query: string,
    role?: string,
    options: { maxResults?: number; useCache?: boolean; fuzzyThreshold?: number } = {},
  ): Promise<{ count: number; matches: UiElement[]; source: string; query: string }> {
    const { maxResults = 50, useCache = true, fuzzyThreshold = 0.6 } = options;
    const uiTree = await this.getUiTree(useCache);

    interface ScoredMatch extends UiElement {
      score: number;
      matchType: 'exact' | 'contains' | 'fuzzy' | 'role' | null;
    }

    const matches: ScoredMatch[] = [];
    const searchLower = query.toLowerCase().trim();
    const targetRole = role?.toLowerCase().trim();

    const searchNode = (node: UiElement, parentPath = '', depth = 0): void => {
      if (matches.length >= maxResults * 2) return; // Collect more for sorting
      if (depth > 15) return; // Limit depth

      const currentPath = parentPath
        ? `${parentPath} > ${node.name || node.role}`
        : node.name || node.role;

      const nodeName = (node.name || '').trim();
      const nodeNameLower = nodeName.toLowerCase();
      const nodeRole = (node.role || '').toLowerCase();

      let score = 0;
      let matchType: ScoredMatch['matchType'] | null = null;

      // Role matching
      const roleMatch = !targetRole || nodeRole === targetRole || nodeRole.includes(targetRole);
      if (!roleMatch) {
        // Still check children even if this node doesn't match role
        if (node.children) {
          node.children.forEach((child) => searchNode(child, currentPath, depth + 1));
        }
        return;
      }

      // If role matches but no name query, include it with lower score
      if (targetRole && !searchLower) {
        score = 0.5;
        matchType = 'role';
      }

      // Name matching (only if there's a search query)
      if (searchLower && nodeName) {
        // Exact match (highest score)
        if (nodeNameLower === searchLower) {
          score = 1.0;
          matchType = 'exact';
        }
        // Starts with (high score)
        else if (nodeNameLower.startsWith(searchLower)) {
          score = 0.9;
          matchType = 'contains';
        }
        // Contains (good score)
        else if (nodeNameLower.includes(searchLower)) {
          score = 0.8;
          matchType = 'contains';
        }
        // Fuzzy match
        else {
          const similarity = stringSimilarity(nodeNameLower, searchLower);
          if (similarity >= fuzzyThreshold) {
            score = similarity * 0.7;
            matchType = 'fuzzy';
          }
        }
      }

      // Boost score for interactive elements
      if (score > 0) {
        const interactiveRoles = ['push button', 'button', 'link', 'text', 'entry', 'menu item'];
        if (interactiveRoles.some((r) => nodeRole.includes(r))) {
          score += 0.1;
        }

        // Boost for elements with valid rectangles (clickable)
        if (node.rect && node.rect.width > 0 && node.rect.height > 0) {
          score += 0.05;
        }

        matches.push({
          ...node,
          path: currentPath,
          score: Math.min(score, 1.0),
          matchType,
        });
      }

      if (node.children) {
        node.children.forEach((child) => searchNode(child, currentPath, depth + 1));
      }
    };

    uiTree.tree.forEach((node) => searchNode(node));

    // Sort by score descending and take top results
    matches.sort((a, b) => b.score - a.score);
    const topMatches = matches.slice(0, maxResults);

    return {
      count: topMatches.length,
      matches: topMatches,
      source: uiTree.source,
      query,
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

    // Group elements by application/window for better readability
    const formatNode = (node: UiElement, indent = 0): void => {
      const prefix = '  '.repeat(indent);
      const name = node.name || '[unnamed]';
      const role = node.role || 'unknown';

      // Skip purely structural elements at deeper levels
      if (indent > 2 && ['panel', 'layer', 'group', 'filler'].includes(role)) {
        return;
      }

      // Format coordinates more compactly
      let coords = '';
      if (node.rect) {
        const { x, y, width, height } = node.rect;
        // Only show coords for interactive elements or at top levels
        if (indent < 2 || ['push button', 'button', 'link', 'text', 'entry', 'menu', 'menu item'].some(r => role.includes(r))) {
          coords = ` [${x},${y} ${width}x${height}]`;
        }
      }

      // Truncate very long names
      const maxLen = indent === 0 ? 60 : 40;
      const displayName = name.length > maxLen ? name.substring(0, maxLen - 3) + '...' : name;

      // Compact role names
      const compactRole = role
        .replace('push button', 'btn')
        .replace('button', 'btn')
        .replace('application', 'app')
        .replace('window', 'win')
        .replace('text entry', 'input')
        .replace('entry', 'input')
        .replace('check box', 'checkbox')
        .replace('combo box', 'dropdown')
        .replace('radio button', 'radio')
        .replace('menu item', 'item')
        .replace('scroll bar', 'scrollbar')
        .replace('list item', 'li')
        .replace('table cell', 'cell');

      lines.push(`${prefix}${compactRole}: "${displayName}"${coords}`);

      // Limit children by relevance
      if (node.children && indent < 3) {
        // At deeper levels, only show interactive elements
        const childrenToShow = indent >= 2
          ? node.children.filter(c => {
              const childRole = (c.role || '').toLowerCase();
              return ['button', 'link', 'text', 'entry', 'input', 'menu', 'item', 'check', 'radio'].some(r => childRole.includes(r));
            })
          : node.children;

        childrenToShow.slice(0, indent === 0 ? 50 : 20).forEach((child) => formatNode(child, indent + 1));

        if (childrenToShow.length > (indent === 0 ? 50 : 20)) {
          lines.push(`${prefix}  ... (${childrenToShow.length - (indent === 0 ? 50 : 20)} more)`);
        }
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
