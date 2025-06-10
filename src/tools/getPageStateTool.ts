/**
 * Get Page State tool - Returns page snapshot with accessibility tree (Snapshot Mode)
 */

import { z } from 'zod';
import { BaseNavigationTool } from './baseNavigationTool.js';

export class GetPageStateTool extends BaseNavigationTool {
  name = 'get_page_state';
  description = 'Get current page state including accessibility tree, visible elements, and interactive elements';
  
  inputSchema = z.object({
    sessionId: z.string().describe('Session ID of existing browser session'),
    includeScreenshot: z.boolean().optional().default(true).describe('Include screenshot of current view'),
    mode: z.enum(['snapshot', 'vision']).optional().default('snapshot').describe('Mode: snapshot (accessibility tree) or vision (visual elements)')
  });

  async execute(args: z.infer<typeof this.inputSchema>, context: any): Promise<any> {
    const session = await this.getOrCreateSession(args, context);
    
    try {
      const page = session.page;
      
      // Get basic page info
      const title = await page.title();
      const url = page.url();
      
      let pageState: any = {
        sessionId: session.id,
        title,
        url,
        navigationHistory: session.navigationHistory,
        hasConsentHandled: session.hasConsentHandled,
        mode: args.mode
      };

      if (args.mode === 'snapshot') {
        // Snapshot Mode: Get accessibility tree and interactive elements
        const accessibilityTree = await page.accessibility.snapshot();
        
        // Get all interactive elements
        const interactiveElements = await page.evaluate(() => {
          const elements: any[] = [];
          const selectors = ['a', 'button', 'input', 'select', 'textarea', '[role="button"]', '[onclick]'];
          
          selectors.forEach(selector => {
            const found = document.querySelectorAll(selector);
            found.forEach((el: any, index) => {
              const rect = el.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                elements.push({
                  type: el.tagName.toLowerCase(),
                  text: el.textContent?.trim() || '',
                  ariaLabel: el.getAttribute('aria-label') || '',
                  placeholder: el.getAttribute('placeholder') || '',
                  name: el.getAttribute('name') || '',
                  id: el.id || '',
                  className: el.className || '',
                  href: el.href || '',
                  role: el.getAttribute('role') || '',
                  isVisible: rect.top >= 0 && rect.top <= window.innerHeight,
                  boundingBox: {
                    x: rect.x,
                    y: rect.y,
                    width: rect.width,
                    height: rect.height
                  },
                  selector: el.id ? `#${el.id}` : 
                           el.className ? `.${el.className.split(' ').join('.')}` : 
                           `${el.tagName.toLowerCase()}:nth-of-type(${index + 1})`
                });
              }
            });
          });
          
          return elements;
        });

        pageState.accessibility = accessibilityTree;
        pageState.interactiveElements = interactiveElements;
        pageState.elementCount = interactiveElements.length;
        
      } else {
        // Vision Mode: Focus on visual representation
        const viewportSize = page.viewportSize();
        
        // Get visible text elements with their positions
        const visibleElements = await page.evaluate(() => {
          const elements: any[] = [];
          const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            null
          );
          
          let node;
          while (node = walker.nextNode()) {
            const parent = node.parentElement;
            if (parent && node.textContent?.trim()) {
              const rect = parent.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight) {
                elements.push({
                  text: node.textContent.trim(),
                  boundingBox: {
                    x: rect.x,
                    y: rect.y,
                    width: rect.width,
                    height: rect.height
                  },
                  fontSize: window.getComputedStyle(parent).fontSize,
                  fontWeight: window.getComputedStyle(parent).fontWeight,
                  color: window.getComputedStyle(parent).color,
                  tagName: parent.tagName.toLowerCase()
                });
              }
            }
          }
          
          return elements;
        });

        pageState.viewportSize = viewportSize;
        pageState.visibleElements = visibleElements;
      }

      // Include screenshot if requested
      if (args.includeScreenshot) {
        const screenshot = await page.screenshot({ fullPage: false });
        pageState.screenshot = screenshot.toString('base64');
      }

      return this.createResult(pageState);
    } catch (error: any) {
      return this.createError(`Failed to get page state: ${error.message}`, {
        sessionId: session.id,
        mode: args.mode
      });
    }
  }
}