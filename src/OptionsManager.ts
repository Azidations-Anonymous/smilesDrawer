import getDefaultOptions from "./DefaultOptions";
import Options = require('./Options');

class OptionsManager {
    private defaultOptions: any;
    opts: any;
    theme: any;

    constructor(userOptions: any) {
        this.defaultOptions = getDefaultOptions();

            this.opts = Options.extend(true, this.defaultOptions, userOptions);
            this.opts.halfBondSpacing = this.opts.bondSpacing / 2.0;
            this.opts.bondLengthSq = this.opts.bondLength * this.opts.bondLength;
            this.opts.halfFontSizeLarge = this.opts.fontSizeLarge / 2.0;
            this.opts.quarterFontSizeLarge = this.opts.fontSizeLarge / 4.0;
            this.opts.fifthFontSizeSmall = this.opts.fontSizeSmall / 5.0;

            // Set the default theme.
            this.theme = this.opts.themes.dark;
    }
}

export = OptionsManager;
