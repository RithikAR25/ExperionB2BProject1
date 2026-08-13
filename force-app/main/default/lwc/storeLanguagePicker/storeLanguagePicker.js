import { LightningElement, track } from 'lwc';
import LANG from '@salesforce/i18n/lang';
import basePath from '@salesforce/community/basePath';
import siteId from '@salesforce/site/Id';
import activeLanguages from '@salesforce/site/activeLanguages';

export default class StoreLanguagePicker extends LightningElement {
    @track currentLanguage;

    connectedCallback() {
        // Match the Salesforce LANG environment variable against our active languages
        // LANG uses hyphens (e.g. en-US), while activeLanguages might use underscores (e.g. en_US)
        const normalizedLang = LANG ? LANG.replace('-', '_') : '';
        const exactMatch = activeLanguages.find(lang => lang.code === LANG);
        const normMatch = activeLanguages.find(lang => lang.code.replace('-', '_') === normalizedLang);
        
        if (exactMatch) {
            this.currentLanguage = exactMatch.code;
        } else if (normMatch) {
            this.currentLanguage = normMatch.code;
        } else {
            this.currentLanguage = LANG || 'en_US'; 
        }
    }

    // Define the languages supported by our storefront dynamically
    get languageOptions() {
        return activeLanguages.map(lang => ({
            label: lang.label,
            value: lang.code
        }));
    }

    handleLanguageChange(event) {
        const selectedLanguage = event.detail.value;
        
        if (this.currentLanguage !== selectedLanguage) {
            console.log('[LanguageSwitcher] --- STARTING LANGUAGE SWITCH ---');
            console.log('[LanguageSwitcher] 1. Current URL:', window.location.href);
            console.log('[LanguageSwitcher] 2. Current detected locale:', this.currentLanguage);
            console.log('[LanguageSwitcher] 3. Selected target locale:', selectedLanguage);

            // ============================================================
            // MODIFICATION: Salesforce multilingual language switching fix
            //
            // Salesforce LWR uses PreferredLanguage<SiteId> for automatic
            // language detection. The custom switcher must update the
            // preference before navigating to the canonical locale URL.
            //
            // English is the default locale and therefore uses /TeamOMS.
            // German uses /TeamOMS/de.
            // ============================================================

            // Determine default language dynamically from activeLanguages
            let defaultLanguageCode = null;
            for (let i = 0; i < activeLanguages.length; i++) {
                if (activeLanguages[i].default === true || activeLanguages[i].isDefault === true) {
                    defaultLanguageCode = activeLanguages[i].code;
                    break;
                }
            }
            if (!defaultLanguageCode) {
                console.warn('[LanguageSwitcher] Could not find explicit default language. Using activeLanguages[0].');
                defaultLanguageCode = activeLanguages.length > 0 ? activeLanguages[0].code : 'en_US';
            }

            console.log('[LanguageSwitcher] Active languages:', JSON.stringify(activeLanguages));
            console.log('[LanguageSwitcher] Default language identified as:', defaultLanguageCode);

            // Update PreferredLanguage cookie
            const cookieName = `PreferredLanguage${siteId}`;
            console.log('[LanguageSwitcher] 7. Custom component changes cookie: YES, updating ' + cookieName);
            
            // Note: SameSite=Lax is used for standard functional cookies
            document.cookie = `${cookieName}=${encodeURIComponent(selectedLanguage)}; path=/; max-age=31536000; SameSite=Lax`;
            
            // Verify cookie was updated
            console.log('[LanguageSwitcher] 9. PreferredLanguage cookie updated. Current document.cookie contains cookieName:', document.cookie.includes(cookieName));
            
            // Clean up any leftover ?language= parameters from old code versions
            let currentUrl = new URL(window.location.href);
            currentUrl.searchParams.delete('language');
            console.log('[LanguageSwitcher] 4. Current pathname:', currentUrl.pathname);

            // Build canonical URL
            const targetUrl = this.buildLocalizedPath(currentUrl, selectedLanguage, defaultLanguageCode, activeLanguages);
            
            console.log('[LanguageSwitcher] 5. Calculated target pathname:', new URL(targetUrl).pathname);
            console.log('[LanguageSwitcher] 6. Navigation method used: window.location.assign');
            console.log('[LanguageSwitcher] 8. Action after navigation: page reload to ' + targetUrl);
            
            // Hard navigation to force context reload and Salesforce router interception
            window.location.assign(targetUrl);
        }
    }

    buildLocalizedPath(currentUrl, targetLanguage, defaultLanguageCode, allActiveLanguages) {
        let siteUrl = basePath;
        
        // Build list of known prefixes from active languages (excluding default)
        const knownPrefixes = [];
        allActiveLanguages.forEach(lang => {
            if (!lang.default && !lang.isDefault && lang.code !== defaultLanguageCode) {
                // Ensure we handle both exact codes and URL-friendly formats (hyphens)
                knownPrefixes.push('/' + lang.code);
                knownPrefixes.push('/' + lang.code.replace('_', '-'));
            }
        });
        
        // Sort prefixes by length descending so we match longer prefixes first
        knownPrefixes.sort((a, b) => b.length - a.length);

        // Strip the existing locale prefix from the basePath to get the raw site root
        for (const prefix of knownPrefixes) {
            if (siteUrl.endsWith(prefix)) {
                siteUrl = siteUrl.substring(0, siteUrl.length - prefix.length);
                break;
            }
        }
        
        const isDefault = (targetLanguage === defaultLanguageCode);
        
        // Construct the new prefix (URL prefixes usually use dashes instead of underscores in Experience Cloud)
        const newLangPrefix = isDefault ? '' : '/' + targetLanguage.replace('_', '-');
        
        const newBasePath = siteUrl + newLangPrefix;
        
        if (basePath) {
            // Replace only the FIRST occurrence of the base path to preserve deep routes
            currentUrl.pathname = currentUrl.pathname.replace(basePath, newBasePath);
        } else {
            // Fallback for empty basePath (domain root)
            let path = currentUrl.pathname;
            let matched = false;
            for (const prefix of knownPrefixes) {
                if (path.startsWith(prefix + '/') || path === prefix) {
                    path = path.substring(prefix.length);
                    matched = true;
                    break;
                }
            }
            // Ensure no double slashes are accidentally created
            currentUrl.pathname = (newLangPrefix + path).replace('//', '/');
        }
        
        return currentUrl.toString();
    }
}