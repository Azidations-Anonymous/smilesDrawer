import Drawer = require('./drawing/Drawer');
import Parser = require('./parsing/Parser');
import ReactionParser = require('./parsing/ReactionParser');
import SvgDrawer = require('./drawing/SvgDrawer');
import ReactionDrawer = require('./reactions/ReactionDrawer');
import SvgWrapper = require('./drawing/SvgWrapper');
import SvgConversionHelper = require('./drawing/helpers/SvgConversionHelper');
import Options = require('./config/Options');
import { IMoleculeOptions } from './config/IOptions';

type DrawTarget = string | HTMLCanvasElement | HTMLImageElement | SVGElement | 'svg' | 'canvas' | 'img' | null;
type Weights = number[] | { reactants: number[][], reagents: number[][], products: number[][] } | null;

class SmilesDrawer {
    drawer: SvgDrawer;
    reactionDrawer: ReactionDrawer;

    constructor(moleculeOptions: Partial<IMoleculeOptions> = {}, reactionOptions: any = {}) {
        this.drawer = new SvgDrawer(moleculeOptions);

        // moleculeOptions gets edited in reactionOptions, so clone
        this.reactionDrawer = new ReactionDrawer(reactionOptions, JSON.parse(JSON.stringify(this.drawer.opts)));
    }

    static apply(moleculeOptions: Partial<IMoleculeOptions> = {}, reactionOptions: any = {}, attribute: string = 'data-smiles', theme: string = 'light', successCallback: ((result: SVGElement | HTMLCanvasElement | HTMLImageElement) => void) | null = null, errorCallback: ((error: Error) => void) | null = null): void {
        const drawer = new SmilesDrawer(moleculeOptions, reactionOptions);
        drawer.apply(attribute, theme, successCallback, errorCallback);
    }

    apply(attribute: string = 'data-smiles', theme: string = 'light', successCallback: ((result: SVGElement | HTMLCanvasElement | HTMLImageElement) => void) | null = null, errorCallback: ((error: Error) => void) | null = null): void {
        let elements = document.querySelectorAll(`[${attribute}]`);
        elements.forEach(element => {
            let smiles = element.getAttribute(attribute);

            if (smiles === null) {
                throw Error('No SMILES provided.');
            }

            let currentTheme = theme;
            let weights = null;

            if (element.hasAttribute('data-smiles-theme')) {
                currentTheme = element.getAttribute('data-smiles-theme');
            }

            if (element.hasAttribute('data-smiles-weights')) {
                weights = element.getAttribute('data-smiles-weights').split(",").map(parseFloat);
            }

            if (element.hasAttribute('data-smiles-reactant-weights') ||
                element.hasAttribute('data-smiles-reagent-weights') ||
                element.hasAttribute('data-smiles-product-weights')) {
                weights = { reactants: [], reagents: [], products: [] };
                if (element.hasAttribute('data-smiles-reactant-weights')) {
                    weights.reactants = element.getAttribute('data-smiles-reactant-weights').split(';').map(v => {
                        return v.split(',').map(parseFloat)
                    });
                }

                if (element.hasAttribute('data-smiles-reagent-weights')) {
                    weights.reagents = element.getAttribute('data-smiles-reagent-weights').split(';').map(v => {
                        return v.split(',').map(parseFloat)
                    });
                }

                if (element.hasAttribute('data-smiles-product-weights')) {
                    weights.products = element.getAttribute('data-smiles-product-weights').split(';').map(v => {
                        return v.split(',').map(parseFloat)
                    });
                }
            }

            if (element.hasAttribute('data-smiles-options') || element.hasAttribute('data-smiles-reaction-options')) {
                let moleculeOptions = {};
                if (element.hasAttribute('data-smiles-options')) {
                    moleculeOptions = JSON.parse(element.getAttribute('data-smiles-options')!.replaceAll('\'', '"'));
                }

                let reactionOptions = {};
                if (element.hasAttribute('data-smiles-reaction-options')) {
                    reactionOptions = JSON.parse(element.getAttribute('data-smiles-reaction-options')!.replaceAll('\'', '"'));
                }

                let smilesDrawer = new SmilesDrawer(moleculeOptions, reactionOptions);
                smilesDrawer.draw(smiles, element as DrawTarget, currentTheme, successCallback, errorCallback, weights);
            } else {
                this.draw(smiles, element as DrawTarget, currentTheme, successCallback, errorCallback, weights);
            }
        });
    }

    /**
     * Draw the smiles to the target.
     * @param {String} smiles The SMILES to be depicted.
     * @param {*} target The target element.
     * @param {String} theme The theme.
     * @param {?CallableFunction} successCallback The function called on success.
     * @param {?CallableFunction} errorCallback The function called on error.
     * @param {?Number[]|Object} weights The weights for the gaussians.
     */
    draw(smiles: string, target: DrawTarget, theme: string = 'light', successCallback: ((result: SVGElement | HTMLCanvasElement | HTMLImageElement) => void) | null = null, errorCallback: ((error: Error) => void) | null = null, weights: Weights = null): void {
        // get the settings
        let rest = [];
        [smiles, ...rest] = smiles.split(' ');
        let info = rest.join(' ');

        let settingsOverride: any = {};

        if (info.includes('__')) {
            let settingsString = info.substring(
                info.indexOf('__') + 2,
                info.lastIndexOf('__')
            );

            settingsOverride = JSON.parse(settingsString.replaceAll('\'', '"'));
        }

        let defaultSettings: { textAboveArrow: string, textBelowArrow: string } = {
            textAboveArrow: '{reagents}',
            textBelowArrow: ''
        }

        let settings = Options.extend(true, defaultSettings, settingsOverride) as { textAboveArrow: string, textBelowArrow: string };

        if (smiles.includes('>')) {
            try {
                this.drawReaction(smiles, target, theme, settings, weights, successCallback);
            } catch (err) {
                if (errorCallback) {
                    errorCallback(err as Error);
                } else {
                    console.error(err);
                }
            }
        } else {
            try {
                this.drawMolecule(smiles, target, theme, weights, successCallback);
            } catch (err) {
                if (errorCallback) {
                    errorCallback(err as Error);
                } else {
                    console.error(err);
                }
            }
        }
    }

    drawMolecule(smiles: string, target: DrawTarget, theme: string, weights: Weights, callback: ((result: SVGElement | HTMLCanvasElement | HTMLImageElement) => void) | null): void {
        let parseTree = Parser.parse(smiles, {});

        if (target === null || target === 'svg') {
            let svg = this.drawer.draw(parseTree, null, theme, weights);
            let dims = this.getDimensions(svg);
            svg.setAttributeNS(null, 'width', '' + dims.w);
            svg.setAttributeNS(null, 'height', '' + dims.h);
            if (callback) {
                callback(svg);
            }
        } else if (target === 'canvas') {
            let canvas = this.svgToCanvas(this.drawer.draw(parseTree, null, theme, weights));
            if (callback) {
                callback(canvas);
            }
        } else if (target === 'img') {
            let img = this.svgToImg(this.drawer.draw(parseTree, null, theme, weights));
            if (callback) {
                callback(img);
            }
        } else if (target instanceof HTMLImageElement) {
            this.svgToImg(this.drawer.draw(parseTree, null, theme, weights), target);
            if (callback) {
                callback(target);
            }
        } else if (target instanceof SVGElement) {
            this.drawer.draw(parseTree, target, theme, weights);
            if (callback) {
                callback(target);
            }
        } else {
            let elements = document.querySelectorAll(target as string);
            elements.forEach(element => {
                let tag = element.nodeName.toLowerCase();
                if (tag === 'svg') {
                    this.drawer.draw(parseTree, element as SVGElement, theme, weights);
                    // let dims = this.getDimensions(element);
                    // element.setAttributeNS(null, 'width', '' + dims.w);
                    // element.setAttributeNS(null, 'height', '' + dims.h);
                    if (callback) {
                        callback(element as SVGElement);
                    }
                } else if (tag === 'canvas') {
                    this.svgToCanvas(this.drawer.draw(parseTree, null, theme, weights), element as HTMLCanvasElement);
                    if (callback) {
                        callback(element as HTMLCanvasElement);
                    }
                } else if (tag === 'img') {
                    this.svgToImg(this.drawer.draw(parseTree, null, theme, weights), element as HTMLImageElement);
                    if (callback) {
                        callback(element as HTMLImageElement);
                    }
                }
            });
        }
    }

    drawReaction(smiles: string, target: DrawTarget, theme: string, settings: { textAboveArrow: string, textBelowArrow: string }, weights: Weights, callback: ((result: SVGElement | HTMLCanvasElement | HTMLImageElement) => void) | null): void {
        let reaction = ReactionParser.parse(smiles);

        if (target === null || target === 'svg') {
            let svg = this.reactionDrawer.draw(reaction, null, theme);
            let dims = this.getDimensions(svg);
            svg.setAttributeNS(null, 'width', '' + dims.w);
            svg.setAttributeNS(null, 'height', '' + dims.h);
            if (callback) {
                callback(svg);
            }
        } else if (target === 'canvas') {
            let canvas = this.svgToCanvas(this.reactionDrawer.draw(reaction, null, theme, weights, settings.textAboveArrow, settings.textBelowArrow));
            if (callback) {
                callback(canvas);
            }
        } else if (target === 'img') {
            let img = this.svgToImg(this.reactionDrawer.draw(reaction, null, theme, weights, settings.textAboveArrow, settings.textBelowArrow));
            if (callback) {
                callback(img);
            }
        } else if (target instanceof HTMLImageElement) {
            this.svgToImg(this.reactionDrawer.draw(reaction, null, theme, weights, settings.textAboveArrow, settings.textBelowArrow), target);
            if (callback) {
                callback(target);
            }
        } else if (target instanceof SVGElement) {
            this.reactionDrawer.draw(reaction, target, theme, weights, settings.textAboveArrow, settings.textBelowArrow);
            if (callback) {
                callback(target);
            }
        } else {
            let elements = document.querySelectorAll(target as string);
            elements.forEach(element => {
                let tag = element.nodeName.toLowerCase();
                if (tag === 'svg') {
                    this.reactionDrawer.draw(reaction, element as SVGElement, theme, weights, settings.textAboveArrow, settings.textBelowArrow);
                    // The svg has to have a css width and height set for the other
                    // tags, however, here it would overwrite the chosen width and height
                    if (this.reactionDrawer.opts.scale <= 0) {
                        (element as HTMLElement).style.width = '';
                        (element as HTMLElement).style.height = '';
                    }
                    // let dims = this.getDimensions(element);
                    // element.setAttributeNS(null, 'width', '' + dims.w);
                    // element.setAttributeNS(null, 'height', '' + dims.h);
                    if (callback) {
                        callback(element as SVGElement);
                    }
                } else if (tag === 'canvas') {
                    this.svgToCanvas(this.reactionDrawer.draw(reaction, null, theme, weights, settings.textAboveArrow, settings.textBelowArrow), element as HTMLCanvasElement);
                    if (callback) {
                        callback(element as HTMLCanvasElement);
                    }
                } else if (tag === 'img') {
                    this.svgToImg(this.reactionDrawer.draw(reaction, null, theme, weights, settings.textAboveArrow, settings.textBelowArrow), element as HTMLImageElement);
                    if (callback) {
                        callback(element as HTMLImageElement);
                    }
                }
            });
        }
    }

    svgToCanvas(svg: SVGElement, canvas: HTMLCanvasElement | null = null): HTMLCanvasElement {
        if (canvas === null) {
            canvas = document.createElement('canvas');
        }

        let dims = this.getDimensions(canvas, svg);

        SvgConversionHelper.svgToCanvas(svg, canvas, dims.w, dims.h);
        return canvas;
    }

    svgToImg(svg: SVGElement, img: HTMLImageElement | null = null): HTMLImageElement {
        if (img === null) {
            img = document.createElement('img');
        }

        let dims = this.getDimensions(img, svg);

        SvgConversionHelper.svgToImg(svg, img, dims.w, dims.h);
        return img;
    }

    /**
     * 
     * @param {HTMLImageElement|HTMLCanvasElement|SVGElement} element 
     * @param {SVGElement} svg 
     * @returns {{w: Number, h: Number}} The width and height.
     */
    getDimensions(element: HTMLImageElement | HTMLCanvasElement | SVGElement, svg: SVGElement | null = null): {w: number, h: number} {
        let w = this.drawer.opts.width;
        let h = this.drawer.opts.height;

        if (this.drawer.opts.scale <= 0) {
            if (w === null && element instanceof HTMLCanvasElement) {
                w = element.width;
            } else if (w === null && element instanceof HTMLImageElement) {
                w = element.width;
            }

            if (h === null && element instanceof HTMLCanvasElement) {
                h = element.height;
            } else if (h === null && element instanceof HTMLImageElement) {
                h = element.height;
            }

            if (element.style.width !== "") {
                w = parseInt(element.style.width);
            }

            if (element.style.height !== "") {
                h = parseInt(element.style.height);
            }
        } else if (svg) {
            w = parseFloat(svg.style.width);
            h = parseFloat(svg.style.height);
        }

        return { w: w, h: h };
    }
}

export = SmilesDrawer;