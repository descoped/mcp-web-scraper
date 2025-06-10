/**
 * Browser snapshot tool for accessibility snapshots
 * Provides comprehensive accessibility tree capture and analysis
 */

import {zodToJsonSchema} from 'zod-to-json-schema';
import {BaseTool} from '../core/toolRegistry.js';
import type {BrowserSnapshotArgs, NavigationToolContext, ToolResult} from '../types/index.js';
import {BrowserSnapshotArgsSchema} from '../types/index.js';

export class BrowserSnapshotTool extends BaseTool {
    public readonly name = 'browser_snapshot';
    public readonly description = 'Capture accessibility snapshots for A11y testing and element analysis';
    public readonly inputSchema = zodToJsonSchema(BrowserSnapshotArgsSchema);

    async execute(args: Record<string, unknown>, context: NavigationToolContext): Promise<ToolResult> {
        const validatedArgs = this.validateArgs<BrowserSnapshotArgs>(args, BrowserSnapshotArgsSchema);

        if (!context.pageManager) {
            throw new Error('Page manager not available. Use navigation tools to create a session first.');
        }

        const session = await context.pageManager.getSession(validatedArgs.sessionId);
        if (!session) {
            throw new Error(`Session ${validatedArgs.sessionId} not found`);
        }

        try {
            // Get accessibility snapshot options
            const snapshotOptions: any = {
                interestingOnly: validatedArgs.interestingOnly
            };

            if (validatedArgs.root) {
                // Find the root element first
                const rootElement = await session.page.locator(validatedArgs.root).first();
                await rootElement.waitFor({state: 'attached'});
                snapshotOptions.root = rootElement;
            }

            // Capture accessibility snapshot
            const accessibilitySnapshot = await session.page.accessibility.snapshot(snapshotOptions);

            // Get additional page accessibility information
            const accessibilityInfo = await this.getAccessibilityInfo(session.page);

            // Analyze the accessibility snapshot
            const analysis = this.analyzeAccessibilitySnapshot(accessibilitySnapshot);

            // Get ARIA information
            const ariaInfo = await this.getAriaInfo(session.page);

            // Get form accessibility
            const formAccessibility = await this.getFormAccessibility(session.page);

            // Update session
            session.lastActivity = new Date();

            return this.createResult({
                sessionId: session.id,
                url: session.url,
                navigationHistory: session.navigationHistory,
                hasConsentHandled: session.hasConsentHandled,
                timestamp: new Date().toISOString(),
                accessibility: {
                    success: true,
                    snapshot: accessibilitySnapshot,
                    pageInfo: accessibilityInfo,
                    analysis,
                    ariaInfo,
                    formAccessibility,
                    options: {
                        interestingOnly: validatedArgs.interestingOnly,
                        root: validatedArgs.root
                    },
                    capturedAt: new Date().toISOString()
                }
            });

        } catch (error) {
            throw new Error(`Accessibility snapshot failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async getAccessibilityInfo(page: any) {
        try {
            return await page.evaluate(() => {
                const getAccessibilityFeatures = () => {
                    const features = {
                        hasSkipLinks: !!document.querySelector('a[href^="#"]'),
                        hasLandmarks: document.querySelectorAll('[role="main"], [role="navigation"], [role="banner"], [role="contentinfo"], main, nav, header, footer').length > 0,
                        hasHeadingStructure: document.querySelectorAll('h1, h2, h3, h4, h5, h6').length > 0,
                        hasAltText: Array.from(document.images).every(img => img.alt !== undefined),
                        hasFormLabels: Array.from(document.querySelectorAll('input, select, textarea')).every(input => {
                            const formElement = input as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
                            return (formElement.labels && formElement.labels.length > 0) ||
                                input.getAttribute('aria-label') ||
                                input.getAttribute('aria-labelledby');
                        }),
                        hasFocusIndicators: true, // Would need actual focus testing
                        hasColorContrast: true, // Would need color analysis
                        hasAriaDescriptions: document.querySelectorAll('[aria-describedby]').length > 0,
                        hasLiveRegions: document.querySelectorAll('[aria-live]').length > 0
                    };

                    return features;
                };

                const getHeadingStructure = () => {
                    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
                    return headings.map(heading => ({
                        level: parseInt(heading.tagName.charAt(1)),
                        text: heading.textContent?.trim() || '',
                        id: heading.id || null,
                        hasTabIndex: heading.hasAttribute('tabindex')
                    }));
                };

                const getLandmarks = () => {
                    const landmarks = Array.from(document.querySelectorAll(
                        '[role="main"], [role="navigation"], [role="banner"], [role="contentinfo"], ' +
                        '[role="complementary"], [role="search"], main, nav, header, footer, aside'
                    ));

                    return landmarks.map(landmark => ({
                        tagName: landmark.tagName.toLowerCase(),
                        role: landmark.getAttribute('role') || landmark.tagName.toLowerCase(),
                        ariaLabel: landmark.getAttribute('aria-label'),
                        ariaLabelledBy: landmark.getAttribute('aria-labelledby'),
                        id: landmark.id || null
                    }));
                };

                return {
                    title: document.title,
                    lang: document.documentElement.lang,
                    hasAccessibilityFeatures: getAccessibilityFeatures(),
                    headingStructure: getHeadingStructure(),
                    landmarks: getLandmarks(),
                    totalElements: document.querySelectorAll('*').length,
                    interactiveElements: document.querySelectorAll('a, button, input, select, textarea, [tabindex]').length,
                    imagesWithoutAlt: Array.from(document.images).filter(img => !img.alt).length,
                    totalImages: document.images.length
                };
            });
        } catch (error) {
            return {
                title: 'Unknown',
                lang: '',
                hasAccessibilityFeatures: {},
                headingStructure: [],
                landmarks: [],
                totalElements: 0,
                interactiveElements: 0,
                imagesWithoutAlt: 0,
                totalImages: 0,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    private analyzeAccessibilitySnapshot(snapshot: any) {
        if (!snapshot) {
            return {
                nodeCount: 0,
                roles: {},
                hasNames: 0,
                hasDescriptions: 0,
                hasValues: 0,
                interactiveNodes: 0,
                landmarks: 0,
                issues: ['No accessibility snapshot available']
            };
        }

        const analysis = {
            nodeCount: 0,
            roles: {} as Record<string, number>,
            hasNames: 0,
            hasDescriptions: 0,
            hasValues: 0,
            interactiveNodes: 0,
            landmarks: 0,
            issues: [] as string[]
        };

        const analyzeNode = (node: any) => {
            analysis.nodeCount++;

            if (node.role) {
                analysis.roles[node.role] = (analysis.roles[node.role] || 0) + 1;
            }

            if (node.name) {
                analysis.hasNames++;
            }

            if (node.description) {
                analysis.hasDescriptions++;
            }

            if (node.value !== undefined) {
                analysis.hasValues++;
            }

            // Check for interactive elements
            const interactiveRoles = ['button', 'link', 'textbox', 'combobox', 'slider', 'menuitem'];
            if (node.role && interactiveRoles.includes(node.role)) {
                analysis.interactiveNodes++;
            }

            // Check for landmarks
            const landmarkRoles = ['main', 'navigation', 'banner', 'contentinfo', 'complementary', 'search'];
            if (node.role && landmarkRoles.includes(node.role)) {
                analysis.landmarks++;
            }

            // Analyze children recursively
            if (node.children) {
                node.children.forEach(analyzeNode);
            }
        };

        analyzeNode(snapshot);

        // Add accessibility issues based on analysis
        if (analysis.landmarks === 0) {
            analysis.issues.push('No landmark regions found');
        }

        if (analysis.roles['heading'] === 0) {
            analysis.issues.push('No headings found');
        }

        if (analysis.interactiveNodes > 0 && analysis.hasNames < analysis.interactiveNodes) {
            analysis.issues.push('Some interactive elements may lack accessible names');
        }

        return analysis;
    }

    private async getAriaInfo(page: any) {
        try {
            return await page.evaluate(() => {
                const ariaElements = document.querySelectorAll('[aria-label], [aria-labelledby], [aria-describedby], [role]');
                const ariaInfo = {
                    totalAriaElements: ariaElements.length,
                    ariaLabels: document.querySelectorAll('[aria-label]').length,
                    ariaLabelledBy: document.querySelectorAll('[aria-labelledby]').length,
                    ariaDescribedBy: document.querySelectorAll('[aria-describedby]').length,
                    customRoles: document.querySelectorAll('[role]').length,
                    ariaHidden: document.querySelectorAll('[aria-hidden="true"]').length,
                    ariaExpanded: document.querySelectorAll('[aria-expanded]').length,
                    ariaSelected: document.querySelectorAll('[aria-selected]').length,
                    ariaChecked: document.querySelectorAll('[aria-checked]').length,
                    ariaDisabled: document.querySelectorAll('[aria-disabled]').length,
                    ariaInvalid: document.querySelectorAll('[aria-invalid]').length,
                    ariaRequired: document.querySelectorAll('[aria-required]').length
                };

                // Get role distribution
                const roles: Record<string, number> = {};
                document.querySelectorAll('[role]').forEach(el => {
                    const role = el.getAttribute('role');
                    if (role) {
                        roles[role] = (roles[role] || 0) + 1;
                    }
                });

                return {
                    ...ariaInfo,
                    roleDistribution: roles
                };
            });
        } catch (error) {
            return {
                totalAriaElements: 0,
                ariaLabels: 0,
                ariaLabelledBy: 0,
                ariaDescribedBy: 0,
                customRoles: 0,
                ariaHidden: 0,
                ariaExpanded: 0,
                ariaSelected: 0,
                ariaChecked: 0,
                ariaDisabled: 0,
                ariaInvalid: 0,
                ariaRequired: 0,
                roleDistribution: {},
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    private async getFormAccessibility(page: any) {
        try {
            return await page.evaluate(() => {
                const forms = Array.from(document.forms);
                const formAnalysis = forms.map(form => {
                    const inputs = Array.from(form.querySelectorAll('input, select, textarea'));

                    return {
                        id: form.id || null,
                        name: form.name || null,
                        action: form.action,
                        method: form.method,
                        inputCount: inputs.length,
                        labeledInputs: inputs.filter(input => {
                            const formElement = input as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
                            return (formElement.labels && formElement.labels.length > 0) ||
                                input.getAttribute('aria-label') ||
                                input.getAttribute('aria-labelledby');
                        }).length,
                        requiredInputs: inputs.filter(input =>
                            input.hasAttribute('required') ||
                            input.getAttribute('aria-required') === 'true'
                        ).length,
                        invalidInputs: inputs.filter(input =>
                            input.getAttribute('aria-invalid') === 'true'
                        ).length,
                        hasFieldset: form.querySelectorAll('fieldset').length > 0,
                        hasLegend: form.querySelectorAll('legend').length > 0
                    };
                });

                const totalInputs = document.querySelectorAll('input, select, textarea').length;
                const labeledInputs = Array.from(document.querySelectorAll('input, select, textarea')).filter(input => {
                    const formElement = input as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
                    return (formElement.labels && formElement.labels.length > 0) ||
                        input.getAttribute('aria-label') ||
                        input.getAttribute('aria-labelledby');
                }).length;

                return {
                    totalForms: forms.length,
                    totalInputs,
                    labeledInputs,
                    labelingPercentage: totalInputs > 0 ? Math.round((labeledInputs / totalInputs) * 100) : 0,
                    forms: formAnalysis
                };
            });
        } catch (error) {
            return {
                totalForms: 0,
                totalInputs: 0,
                labeledInputs: 0,
                labelingPercentage: 0,
                forms: [],
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
}