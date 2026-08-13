import { LightningElement, track } from 'lwc';
import LANG from '@salesforce/i18n/lang';
import basePath from '@salesforce/community/basePath';
import siteId from '@salesforce/site/Id';
import activeLanguages from '@salesforce/site/activeLanguages';

export default class StoreLanguagePicker extends LightningElement {
    @track currentLanguage;

    // ============================================================
    // MODIFIED SECTION:
    // Controls whether the custom dropdown is open.
    // ============================================================
    @track isMenuOpen = false;


    connectedCallback() {
        // ============================================================
        // MODIFIED SECTION:
        // Close the dropdown when the user clicks outside the
        // language picker.
        // ============================================================
        document.addEventListener(
            'click',
            this.handleDocumentClick
        );


        // Match the Salesforce LANG environment variable
        // against our active languages.
        //
        // LANG uses hyphens (en-US)
        // activeLanguages may use underscores (en_US)

        const normalizedLang = LANG
            ? LANG.replace('-', '_')
            : '';

        const exactMatch = activeLanguages.find(
            lang => lang.code === LANG
        );

        const normMatch = activeLanguages.find(
            lang =>
                lang.code.replace('-', '_') === normalizedLang
        );

        if (exactMatch) {
            this.currentLanguage = exactMatch.code;
        } else if (normMatch) {
            this.currentLanguage = normMatch.code;
        } else {
            this.currentLanguage = LANG || 'en_US';
        }
    }


    disconnectedCallback() {
        // ============================================================
        // MODIFIED SECTION:
        // Remove the document listener when the component is
        // destroyed.
        // ============================================================
        document.removeEventListener(
            'click',
            this.handleDocumentClick
        );
    }


    // ============================================================
    // MODIFIED SECTION:
    // Current language display label.
    // ============================================================

    get currentLanguageLabel() {
        const current = activeLanguages.find(
            lang => lang.code === this.currentLanguage
        );

        return current
            ? current.label
            : this.currentLanguage;
    }


    // ============================================================
    // MODIFIED SECTION:
    // Prepare language options for our custom dropdown.
    // ============================================================

    get languageOptions() {
        return activeLanguages.map(lang => ({
            label: lang.label,
            value: lang.code,
            isSelected: lang.code === this.currentLanguage,

            cssClass:
                lang.code === this.currentLanguage
                    ? 'language-option language-option-selected'
                    : 'language-option'
        }));
    }


    // ============================================================
    // MODIFIED SECTION:
    // Open / close dropdown.
    // ============================================================

    toggleMenu(event) {
        event.stopPropagation();

        this.isMenuOpen = !this.isMenuOpen;
    }


    // ============================================================
    // MODIFIED SECTION:
    // Keep clicks inside the component from reaching the
    // document-level outside-click handler.
    // ============================================================

    handleContainerClick(event) {
        event.stopPropagation();
    }


    // ============================================================
    // MODIFIED SECTION:
    // Close when clicking outside the component.
    // ============================================================

    handleDocumentClick = () => {
        this.isMenuOpen = false;
    };


    // ============================================================
    // MODIFIED SECTION:
    // Keyboard support.
    // ============================================================

    handleButtonKeyDown(event) {
        if (event.key === 'Escape') {
            this.isMenuOpen = false;
        }

        if (
            event.key === 'Enter' ||
            event.key === ' '
        ) {
            event.preventDefault();
            this.isMenuOpen = !this.isMenuOpen;
        }
    }


    // ============================================================
    // MODIFIED SECTION:
    // Language selection.
    //
    // The remainder of your original Salesforce multilingual
    // navigation logic is preserved.
    // ============================================================

    handleLanguageChange(event) {
        const selectedLanguage =
            event.currentTarget.dataset.value;

        this.isMenuOpen = false;

        if (this.currentLanguage !== selectedLanguage) {
            console.log(
                '[LanguageSwitcher] --- STARTING LANGUAGE SWITCH ---'
            );

            console.log(
                '[LanguageSwitcher] 1. Current URL:',
                window.location.href
            );

            console.log(
                '[LanguageSwitcher] 2. Current detected locale:',
                this.currentLanguage
            );

            console.log(
                '[LanguageSwitcher] 3. Selected target locale:',
                selectedLanguage
            );


            // ========================================================
            // ORIGINAL LANGUAGE SWITCHING LOGIC
            // ========================================================

            let defaultLanguageCode = null;

            for (
                let i = 0;
                i < activeLanguages.length;
                i++
            ) {
                if (
                    activeLanguages[i].default === true ||
                    activeLanguages[i].isDefault === true
                ) {
                    defaultLanguageCode =
                        activeLanguages[i].code;

                    break;
                }
            }


            if (!defaultLanguageCode) {
                console.warn(
                    '[LanguageSwitcher] Could not find explicit default language. Using activeLanguages[0].'
                );

                defaultLanguageCode =
                    activeLanguages.length > 0
                        ? activeLanguages[0].code
                        : 'en_US';
            }


            console.log(
                '[LanguageSwitcher] Active languages:',
                JSON.stringify(activeLanguages)
            );

            console.log(
                '[LanguageSwitcher] Default language identified as:',
                defaultLanguageCode
            );


            // Update PreferredLanguage cookie

            const cookieName =
                `PreferredLanguage${siteId}`;


            console.log(
                '[LanguageSwitcher] 7. Custom component changes cookie: YES, updating ' +
                cookieName
            );


            document.cookie =
                `${cookieName}=${encodeURIComponent(
                    selectedLanguage
                )}; path=/; max-age=31536000; SameSite=Lax`;


            console.log(
                '[LanguageSwitcher] 9. PreferredLanguage cookie updated. Current document.cookie contains cookieName:',
                document.cookie.includes(cookieName)
            );


            // Clean up old language query parameter

            let currentUrl =
                new URL(window.location.href);

            currentUrl.searchParams.delete(
                'language'
            );


            console.log(
                '[LanguageSwitcher] 4. Current pathname:',
                currentUrl.pathname
            );


            // Build canonical URL

            const targetUrl =
                this.buildLocalizedPath(
                    currentUrl,
                    selectedLanguage,
                    defaultLanguageCode,
                    activeLanguages
                );


            console.log(
                '[LanguageSwitcher] 5. Calculated target pathname:',
                new URL(targetUrl).pathname
            );


            console.log(
                '[LanguageSwitcher] 6. Navigation method used: window.location.assign'
            );


            console.log(
                '[LanguageSwitcher] 8. Action after navigation: page reload to ' +
                targetUrl
            );


            // Hard navigation

            window.location.assign(
                targetUrl
            );
        }
    }


    buildLocalizedPath(
        currentUrl,
        targetLanguage,
        defaultLanguageCode,
        allActiveLanguages
    ) {
        let siteUrl = basePath;


        // Build list of known prefixes
        const knownPrefixes = [];


        allActiveLanguages.forEach(lang => {
            if (
                !lang.default &&
                !lang.isDefault &&
                lang.code !== defaultLanguageCode
            ) {
                knownPrefixes.push(
                    '/' + lang.code
                );

                knownPrefixes.push(
                    '/' +
                    lang.code.replace('_', '-')
                );
            }
        });


        // Sort longest first

        knownPrefixes.sort(
            (a, b) => b.length - a.length
        );


        // Strip existing locale prefix

        for (const prefix of knownPrefixes) {
            if (siteUrl.endsWith(prefix)) {
                siteUrl =
                    siteUrl.substring(
                        0,
                        siteUrl.length -
                        prefix.length
                    );

                break;
            }
        }


        const isDefault =
            targetLanguage ===
            defaultLanguageCode;


        const newLangPrefix =
            isDefault
                ? ''
                : '/' +
                  targetLanguage.replace(
                      '_',
                      '-'
                  );


        const newBasePath =
            siteUrl +
            newLangPrefix;


        if (basePath) {

            // Replace only first occurrence
            currentUrl.pathname =
                currentUrl.pathname.replace(
                    basePath,
                    newBasePath
                );

        } else {

            // Fallback for empty basePath

            let path =
                currentUrl.pathname;

            for (
                const prefix of knownPrefixes
            ) {

                if (
                    path.startsWith(
                        prefix + '/'
                    ) ||
                    path === prefix
                ) {

                    path =
                        path.substring(
                            prefix.length
                        );

                    break;
                }
            }


            currentUrl.pathname =
                (
                    newLangPrefix +
                    path
                ).replace(
                    '//',
                    '/'
                );
        }


        return currentUrl.toString();
    }
}