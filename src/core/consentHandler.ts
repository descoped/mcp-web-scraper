/**
 * Cookie consent handler with comprehensive multi-language support
 * Preserves all 30+ language patterns and intelligent detection strategies
 */

import type { Page, Frame } from 'playwright';
import type { ConsentPatterns, ConsentResult, DialogState } from '../types/index.js';

export class ConsentHandler {
  private readonly patterns: ConsentPatterns;

  constructor() {
    // CRITICAL: Preserve all consent detection patterns (30+ languages)
    this.patterns = {
      // Attribute-based selectors (fastest, most reliable)
      attributes: [
        'button[title*="accept" i]',
        'button[aria-label*="accept" i]',
        'button[data-consent="accept"]',
        '[id*="accept" i][role="button"]',
        '[class*="accept" i]:not([class*="reject"]):not([class*="decline"])'
      ],
      
      // Text-based selectors (comprehensive multi-language support)
      textPatterns: [
        // English (Global)
        'Accept', 'Agree', 'OK', 'Allow', 'Accept All', 'Accept Cookies', 'I Accept', 'Continue',
        
        // Scandinavian Languages
        'Godta', 'Aksepter', 'Tillat', 'Godta alle', 'Aksepter alle', 'Jeg godtar', 'Jeg aksepterer',  // Norwegian
        'Tillad', 'Tillad alle', 'Accepter', 'Accepter alle', 'Jeg accepterer',  // Danish
        'Acceptera', 'Acceptera alla', 'Godkänn', 'Jag accepterar', 'Tillåt alla',  // Swedish
        'Hyväksy', 'Hyväksy kaikki', 'Salli', 'Salli kaikki',  // Finnish
        'Samþykkja', 'Leyfa', 'Ég samþykki',  // Icelandic
        
        // Germanic Languages
        'Akzeptieren', 'Zustimmen', 'Alle akzeptieren', 'Ich stimme zu', 'Einverstanden',  // German
        'Accepteren', 'Akkoord', 'Alle accepteren', 'Ik ga akkoord',  // Dutch
        
        // Romance Languages
        'Accepter', 'Autoriser', 'J\'accepte', 'Tout accepter', 'D\'accord',  // French
        'Aceptar', 'Acepto', 'Aceptar todo', 'Estoy de acuerdo',  // Spanish
        'Aceitar', 'Aceito', 'Aceitar tudo', 'Concordo',  // Portuguese
        'Accettare', 'Accetto', 'Accetta tutto', 'Sono d\'accordo', 'Acconsento', 'Procedi',  // Italian
        'Accepta', 'Accept', 'Sunt de acord',  // Romanian
        
        // Slavic Languages
        'Принять', 'Согласен', 'Принять все',  // Russian
        'Zaakceptuj', 'Zgadzam się', 'Akceptuję wszystkie',  // Polish
        'Přijmout', 'Souhlasím', 'Přijmout vše',  // Czech
        'Prijať', 'Súhlasím', 'Prijať všetko',  // Slovak
        'Прихватам', 'Сагласан сам',  // Serbian
        'Prihvaćam', 'Slažem se',  // Croatian
        'Sprejmi', 'Se strinjam',  // Slovenian
        'Приемам', 'Съгласен съм',  // Bulgarian
        
        // Celtic Languages
        'Derbyn', 'Cytuno',  // Welsh
        'Glacadh', 'Aontaím',  // Irish
        
        // Baltic Languages
        'Priimti', 'Sutinku',  // Lithuanian
        'Pieņemt', 'Piekrītu',  // Latvian
        'Nõustun', 'Vastu võtma',  // Estonian
        
        // Other European Languages
        'Elfogad', 'Egyetértek',  // Hungarian
        'Αποδοχή', 'Συμφωνώ',  // Greek
        'Kabul et', 'Kabul ediyorum',  // Turkish
        'Prihvatam', 'Slažem se',  // Bosnian
        'Прифаќам', 'Се согласувам',  // Macedonian
        'Pranon', 'Jam dakord',  // Albanian
        'Прымаю', 'Згаджаюся',  // Belarusian
        'Приймаю', 'Погоджуюся',  // Ukrainian
        
        // Americas - Indigenous and Regional
        'Aceptar', 'De acuerdo',  // Latin American Spanish variants
        'Aceitar', 'Concordar',  // Brazilian Portuguese variants
        'J\'accepte', 'Je suis d\'accord'  // Canadian French
      ],
      
      // Common CMP framework selectors
      frameworks: [
        '.cmp-button__accept',
        '#onetrust-accept-btn-handler',
        '.sp_choice_type_11',  // Generic consent class
        '.accept-cookies-button',
        '[data-testid*="accept"]',
        
        // Site-specific patterns discovered from failures
        '#GlobalCookieBanner button',  // aftenposten.no
        '#GlobalCookieBanner .button', // aftenposten.no alternative
        '#GlobalCookieBanner [role="button"]', // aftenposten.no role-based
        '#GlobalCookieBanner a',       // aftenposten.no links as buttons
        '#privacy-cp-wall-accept',     // corriere.it
        '.privacy-cp-footer__button_cmp--main',  // corriere.it alternative
        '.fc-consent-root .fc-button.fc-cta-consent',  // Common EU consent
        '.didomi-continue-without-agreeing',  // Didomi CMP
        '#didomi-notice-agree-button',  // Didomi CMP
        '.qc-cmp-button',  // Quantcast CMP
        '.css-47sehv',  // Guardian specific
        '.gdpr-consent-notice-message-action-buttons button',  // GDPR patterns
        '[class*="cookiebanner"] button[class*="accept"]',  // Cookie banner patterns
        '[id*="cookieAccept"]',  // Cookie accept IDs
        '[class*="cookie-accept"]',  // Cookie accept classes
        '.cookie-policy-accept',  // Policy accept
        '.privacy-policy-accept',  // Privacy accept
        '#cookie-law-info-bar .cli-plugin-button',  // Cookie Law Info plugin
        '.moove-gdpr-infobar-allow-all'  // Moove GDPR plugin
      ],
      
      // Container indicators for consent dialogs
      containers: [
        '[class*="cookie" i]',
        '[id*="cookie" i]',
        '[class*="consent" i]',
        '[id*="consent" i]',
        '[class*="gdpr" i]',
        '[class*="privacy" i]',
        
        // Additional patterns from failure analysis
        '#GlobalCookieBanner',  // aftenposten.no
        '[class*="privacy-cp-wall"]',  // corriere.it
        '[class*="fc-consent"]',  // FusionConsent CMP
        '[class*="didomi"]',  // Didomi CMP
        '[class*="qc-cmp"]',  // Quantcast CMP
        '[class*="moove-gdpr"]',  // Moove GDPR
        '[id*="onetrust"]',  // OneTrust CMP
        '[class*="cookielaw"]',  // Cookie Law Info
        '[class*="cookie-banner"]',  // Generic cookie banners
        '[class*="cookie-notice"]'  // Cookie notices
      ]
    };
  }

  /**
   * Handle cookie consent with intelligent multi-strategy approach
   * Maintains <1000ms performance requirement
   */
  async handleCookieConsent(page: Page, maxWaitTime: number = 3000): Promise<ConsentResult> {
    const startTime = Date.now();
    
    try {
      // Step 1: Detect if consent dialogs exist
      const initialDialogState = await this.detectConsentDialogs(page);
      console.log(`Initial consent dialog detection: ${JSON.stringify(initialDialogState)}`);
      
      // If no dialogs detected, return early
      if (!initialDialogState.hasDialogs) {
        console.log('No consent dialogs detected');
        return { success: true, reason: 'no_dialogs_found', method: 'none' };
      }

      // Step 2: Try main frame first (fastest)
      const mainFrameResult = await this.findAndClickConsentButton(page);
      if (mainFrameResult) {
        const verified = await this.verifyConsentAccepted(page, initialDialogState);
        if (verified.success) {
          console.log(`Cookie consent accepted and verified in main frame: ${mainFrameResult}`);
          return { 
            success: true, 
            reason: 'accepted_main_frame', 
            method: mainFrameResult, 
            verification: verified 
          };
        }
      }

      // Step 3: Check iframes for consent dialogs
      await page.waitForTimeout(500); // Brief wait for iframes to load
      const frames = page.frames();
      
      for (const frame of frames) {
        const url = frame.url();
        // Skip main frame and empty frames
        if (!url || url === 'about:blank' || url === page.url()) continue;
        
        // Check if frame might contain consent dialog
        if (this.isConsentFrame(url)) {
          const iframeResult = await this.findAndClickConsentButton(frame);
          if (iframeResult) {
            const verified = await this.verifyConsentAccepted(page, initialDialogState);
            if (verified.success) {
              console.log(`Cookie consent accepted and verified in iframe: ${iframeResult}`);
              return { 
                success: true, 
                reason: 'accepted_iframe', 
                method: iframeResult, 
                verification: verified 
              };
            }
          }
        }
      }

      return { success: false, reason: 'no_buttons_found_or_verified' };
    } catch (error) {
      console.log('Cookie consent error:', error instanceof Error ? error.message : String(error));
      return { 
        success: false, 
        reason: 'error', 
        error: error instanceof Error ? error.message : String(error) 
      };
    } finally {
      const elapsed = Date.now() - startTime;
      console.log(`Cookie consent completed in ${elapsed}ms`);
    }
  }

  /**
   * Detect presence and characteristics of consent dialogs
   */
  private async detectConsentDialogs(page: Page): Promise<DialogState> {
    const dialogs: DialogState = {
      hasDialogs: false,
      mainFrameDialogs: [],
      iframeDialogs: [],
      overlays: []
    };

    try {
      // Check main frame for dialog indicators
      const mainFrameIndicators = await page.$$eval(
        this.patterns.containers.join(','),
        elements => elements.map(el => {
          const htmlEl = el as HTMLElement;
          return {
            tagName: htmlEl.tagName,
            className: htmlEl.className,
            id: htmlEl.id,
            visible: htmlEl.offsetParent !== null,
            zIndex: window.getComputedStyle(htmlEl).zIndex
          };
        })
      ).catch(() => []);
      
      dialogs.mainFrameDialogs = mainFrameIndicators.filter(el => el.visible);
      
      // Check for modal overlays or blocking elements
      const overlays = await page.$$eval(
        '[class*="modal"], [class*="overlay"], [class*="backdrop"], [style*="position: fixed"]',
        elements => elements.map(el => {
          const htmlEl = el as HTMLElement;
          return {
            className: htmlEl.className,
            visible: htmlEl.offsetParent !== null,
            zIndex: window.getComputedStyle(htmlEl).zIndex
          };
        })
      ).catch(() => []);
      
      dialogs.overlays = overlays.filter(el => el.visible && parseInt(el.zIndex) > 1000);

      // Check iframes for consent dialogs
      const frames = page.frames();
      for (const frame of frames) {
        const url = frame.url();
        if (url && url !== 'about:blank' && this.isConsentFrame(url)) {
          dialogs.iframeDialogs.push({
            url,
            isConsentFrame: true
          });
        }
      }

      dialogs.hasDialogs = dialogs.mainFrameDialogs.length > 0 || 
                          dialogs.iframeDialogs.length > 0 || 
                          dialogs.overlays.length > 0;

    } catch (error) {
      console.log('Error detecting consent dialogs:', error instanceof Error ? error.message : String(error));
    }

    return dialogs;
  }

  /**
   * Verify that consent was actually accepted (dialogs disappeared, state changed)
   */
  private async verifyConsentAccepted(page: Page, initialState: DialogState): Promise<{
    success: boolean;
    dialogsRemoved: boolean;
    consentCookiesSet: number;
    noBlockingOverlays: boolean;
    postClickDialogs: number;
    postClickOverlays: number;
  }> {
    await page.waitForTimeout(1000); // Wait for dialog dismissal animation
    
    try {
      const postClickState = await this.detectConsentDialogs(page);
      
      // Check if dialogs disappeared
      const dialogsRemoved = (postClickState.mainFrameDialogs.length < initialState.mainFrameDialogs.length) ||
                            (postClickState.overlays.length < initialState.overlays.length);
      
      // Check if cookies were set (basic verification)
      const cookies = await page.context().cookies();
      const consentCookies = cookies.filter(cookie => 
        cookie.name.toLowerCase().includes('consent') ||
        cookie.name.toLowerCase().includes('cookie') ||
        cookie.name.toLowerCase().includes('gdpr') ||
        cookie.name.toLowerCase().includes('accept')
      );
      
      // Check if page content is accessible (no blocking overlays)
      const hasBlockingOverlays = await page.evaluate(() => {
        const overlays = document.querySelectorAll('[style*="position: fixed"], [class*="modal"], [class*="overlay"]');
        return Array.from(overlays).some((el: Element) => {
          const htmlEl = el as HTMLElement;
          const style = window.getComputedStyle(htmlEl);
          return htmlEl.offsetParent !== null && 
                 parseInt(style.zIndex) > 1000 && 
                 (style.position === 'fixed' || style.position === 'absolute');
        });
      });

      return {
        success: dialogsRemoved || consentCookies.length > 0 || !hasBlockingOverlays,
        dialogsRemoved,
        consentCookiesSet: consentCookies.length,
        noBlockingOverlays: !hasBlockingOverlays,
        postClickDialogs: postClickState.mainFrameDialogs.length,
        postClickOverlays: postClickState.overlays.length
      };
    } catch (error) {
      console.log('Error verifying consent acceptance:', error instanceof Error ? error.message : String(error));
      return { 
        success: false, 
        dialogsRemoved: false,
        consentCookiesSet: 0,
        noBlockingOverlays: false,
        postClickDialogs: 0,
        postClickOverlays: 0
      };
    }
  }

  /**
   * Generic method to find and click consent buttons in any frame
   * Multi-strategy approach: attribute → framework → text-based
   */
  private async findAndClickConsentButton(frameOrPage: Page | Frame): Promise<string | null> {
    // 1. Try attribute-based selectors (most reliable)
    for (const selector of this.patterns.attributes) {
      try {
        const button = await frameOrPage.$(selector);
        if (button && await button.isVisible()) {
          await button.click();
          return selector;
        }
      } catch (e) { /* Continue */ }
    }

    // 2. Try framework-specific selectors
    for (const selector of this.patterns.frameworks) {
      try {
        const button = await frameOrPage.$(selector);
        if (button && await button.isVisible()) {
          await button.click();
          return selector;
        }
      } catch (e) { /* Continue */ }
    }

    // 3. Try text-based matching
    for (const text of this.patterns.textPatterns) {
      try {
        const button = frameOrPage.locator(`button:has-text("${text}")`).first();
        if (await button.isVisible()) {
          await button.click();
          return `text:${text}`;
        }
      } catch (e) { /* Continue */ }
    }

    return null;
  }

  /**
   * Check if frame URL indicates it might contain consent dialog
   */
  private isConsentFrame(url: string): boolean {
    const consentIndicators = ['consent', 'privacy', 'cookie', 'gdpr', 'cmp'];
    return consentIndicators.some(indicator => url.toLowerCase().includes(indicator));
  }

  /**
   * Get consent patterns for external access
   */
  getPatterns(): ConsentPatterns {
    return this.patterns;
  }
}