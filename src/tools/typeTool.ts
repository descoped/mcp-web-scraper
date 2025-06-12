/**
 * Type tool - Type text into input fields
 */

import {z} from 'zod';
import {BaseNavigationTool} from '@/tools/baseNavigationTool.js';

export class TypeTool extends BaseNavigationTool {
    name = 'type';
    description = 'Type text into an input field or editable element';

    inputSchema = z.object({
        sessionId: z.string().describe('Session ID of existing browser session'),
        selector: z.string().optional().describe('CSS selector of input element'),
        name: z.string().optional().describe('Name attribute of input element'),
        placeholder: z.string().optional().describe('Placeholder text of input element'),
        text: z.string().describe('Text to type into the element'),
        clearFirst: z.boolean().optional().default(true).describe('Clear existing text before typing'),
        pressEnter: z.boolean().optional().default(false).describe('Press Enter key after typing'),
        delay: z.number().optional().default(50).describe('Delay between keystrokes in milliseconds')
    }).refine(
        (data) => data.selector || data.name || data.placeholder,
        {message: 'At least one of selector, name, or placeholder must be provided'}
    );

    async execute(args: z.infer<typeof this.inputSchema>, context: import('@/types/index.js').NavigationToolContext): Promise<import('@/types/index.js').ToolResult> {
        const session = await this.getOrCreateSession(args, context);

        try {
            let elementLocator;

            // Build locator based on provided criteria
            if (args.selector) {
                elementLocator = session.page.locator(args.selector);
            } else if (args.name) {
                elementLocator = session.page.locator(`[name="${args.name}"]`);
            } else if (args.placeholder) {
                elementLocator = session.page.locator(`[placeholder="${args.placeholder}"]`);
            }

            // Check if element exists and is visible
            const isVisible = await elementLocator!.isVisible();
            if (!isVisible) {
                throw new Error('Input element not visible');
            }

            // Clear existing text if requested
            if (args.clearFirst) {
                await elementLocator!.clear();
            }

            // Type text with specified delay
            await elementLocator!.type(args.text, {delay: args.delay});

            // Press Enter if requested
            if (args.pressEnter) {
                await elementLocator!.press('Enter');
                // Wait for potential navigation or form submission
                await session.page.waitForTimeout(1000);
            }

            // Get element value after typing
            const currentValue = await elementLocator!.inputValue();

            // Check if form submission or navigation occurred
            const newUrl = session.page.url();
            const navigationOccurred = newUrl !== session.url;

            if (navigationOccurred) {
                session.url = newUrl;
                session.navigationHistory.push(newUrl);
            }

            const resultData = {
                success: true,
                sessionId: session.id,
                typed: {
                    text: args.text,
                    currentValue,
                    selector: args.selector,
                    name: args.name,
                    placeholder: args.placeholder
                },
                pressedEnter: args.pressEnter,
                navigationOccurred,
                currentUrl: newUrl
            };

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(resultData, null, 2)
                    }
                ]
            };
        } catch (error: unknown) {
            const errorMessage = `Type operation failed: ${error instanceof Error ? error.message : String(error)}`;
            const errorData = {
                success: false,
                error: errorMessage,
                sessionId: session.id,
                selector: args.selector,
                name: args.name,
                placeholder: args.placeholder,
                timestamp: new Date().toISOString()
            };

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(errorData, null, 2)
                    }
                ],
                isError: true
            };
        }
    }
}