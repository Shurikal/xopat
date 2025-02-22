/*
 * This software was developed at the National Institute of Standards and
 * Technology by employees of the Federal Government in the course of
 * their official duties. Pursuant to title 17 Section 105 of the United
 * States Code this software is not subject to copyright protection and is
 * in the public domain. This software is an experimental system. NIST assumes
 * no responsibility whatsoever for its use by other parties, and makes no
 * guarantees, expressed or implied, about its quality, reliability, or
 * any other characteristic. We would appreciate acknowledgement if the
 * software is used.
 */

/**
 * @author Antoine Vandecreme <antoine.vandecreme@nist.gov>
 * @author Aiosa (modifications)
 *
 * @typedef ScaleBarConfig
 * @type {object}
 * @property {OpenSeadragon.Viewer} viewer The viewer to attach this Scalebar to.
 * @property {OpenSeadragon.ScalebarType} type The scale bar type. Default: microscopy
 * @property {Integer} pixelsPerMeter The pixels per meter of the
 * zoomable image at the original image size. If null, the scale bar is not
 * displayed. default: null
 * @property {Integer} pixelsPerMeterX The measurement in vertical units, need to specify both X, Y if general not given
 * @property {Integer} pixelsPerMeterY The measurement in horizontal units, need to specify both X, Y if general not given
 * @property (String} minWidth The minimal width of the scale bar as a
 * CSS string (ex: 100px, 1em, 1% etc...) default: 150px
 * @property {OpenSeadragon.ScalebarLocation} location The location
 * of the scale bar inside the viewer. default: bottom left
 * @property {Integer} xOffset Offset location of the scale bar along x. default: 5
 * @property {Integer} yOffset Offset location of the scale bar along y. default: 5
 * @property {Boolean} stayInsideImage When set to true, keep the
 * scale bar inside the image when zooming out. default: true
 * @property {String} color The color of the scale bar using a color
 * name or the hexadecimal format (ex: black or #000000) default: black
 * @property {String} fontColor The font color. default: black
 * @property {String} backgroundColor The background color. default: none
 * @property {String} fontSize The font size. default: not set
 * @property {String} fontFamily The font-family. default: not set
 * @property {String} barThickness The thickness of the scale bar in px. default: 2
 * @property {function} sizeAndTextRenderer A function which will be
 * @property {boolean} destroy
 */
(function($) {

    if (!$.version || $.version.major < 2) {
        throw new Error('This version of OpenSeadragonScalebar requires ' +
            'OpenSeadragon version 2.0.0+');
    }

    /**
     * @memberOf OpenSeadragon.Viewer
     * @param {(ScaleBarConfig|undefined)} options
     *
     */
    $.Viewer.prototype.makeScalebar = function(options) {
        if (!this.scalebar) {
            options = options || {};
            options.viewer = this;
            this.scalebar = new $.Scalebar(options);
        } else if (options.destroy) {
            this.scalebar.destroy();
        } else {
            this.scalebar.refresh(options);
        }
    };

    $.ScalebarType = {
        NONE: 0,
        MICROSCOPY: 1,
        MAP: 2
    };

    $.ScalebarLocation = {
        NONE: 0,
        TOP_LEFT: 1,
        TOP_RIGHT: 2,
        BOTTOM_RIGHT: 3,
        BOTTOM_LEFT: 4
    };

    /**
     * @private
     * @class OpenSeadragon.Scalebar
     * @param {(ScaleBarConfig|undefined)} options
     * called to determine the size of the scale bar and it's text content.
     * The function must have 2 parameters: the PPM at the current zoom level
     * and the minimum size of the scale bar. It must return an object containing
     * 2 attributes: size and text containing the size of the scale bar and the text.
     * default: $.ScalebarSizeAndTextRenderer.METRIC_LENGTH
     */
    $.Scalebar = function(options) {
        options = options || {};
        if (!options.viewer) {
            throw new Error("A viewer must be specified.");
        }
        this.viewer = options.viewer;

        this.divElt = document.createElement("div");
        this.viewer.container.appendChild(this.divElt);
        this.divElt.style.position = "relative";
        this.divElt.style.margin = "0";
        this.divElt.style.pointerEvents = "none";
        this.divElt.id = "viewer-scale-bar";

        this.setMinWidth(options.minWidth || "150px");

        this.setDrawScalebarFunction(options.type || $.ScalebarType.MICROSCOPY);
        this.color = options.color || "black";
        this.fontColor = options.fontColor || "black";
        this.backgroundColor = options.backgroundColor || "none";
        this.fontSize = options.fontSize || "";
        this.fontFamily = options.fontFamily || "";
        this.barThickness = options.barThickness || 2;

        //todo reflect better in API, allow for distinct measures
        this.pixelsPerMeter = options.pixelsPerMeter || (options.pixelsPerMeterX + options.pixelsPerMeterY)/2;
        this.location = options.location || $.ScalebarLocation.BOTTOM_LEFT;
        this.xOffset = options.xOffset || 5;
        this.yOffset = options.yOffset || 5;
        this.stayInsideImage = isDefined(options.stayInsideImage) ?
            options.stayInsideImage : true;
        this.sizeAndTextRenderer = options.sizeAndTextRenderer ||
            $.ScalebarSizeAndTextRenderer.METRIC_LENGTH;

        this.refreshHandler = this.refresh.bind(this);
        if (options.destroy) {
            this._active = false;
        } else {
            this.viewer.addHandler("open", this.refreshHandler);
            this.viewer.addHandler("animation", this.refreshHandler);
            this.viewer.addHandler("resize", this.refreshHandler);
            this._active = true;
        }
    };

    $.Scalebar.prototype = {
        /**
         * Referenced tile image getter used for measurements
         */
        getReferencedTiledImage: function () {},
        /**
         * OpenSeadragon is not accurate when dealing with
         * multiple tilesources: set your own reference tile source
         */
        linkReferenceTileSourceIndex: function(index) {
            this.getReferencedTiledImage = this.viewer.world.getItemAt.bind(this.viewer.world, index);
        },
        /**
         * Compute size of one pixel in the image on your screen
         * @return {number} image pixel size on screen (should be between 0 and 1 in most cases)
         */
        imagePixelSizeOnScreen: function() {
            let viewport = this.viewer.viewport;
            let zoom = viewport.getZoom(true);
            if (this.__cachedZoom !== zoom) {
                this.__cachedZoom = zoom;

                let tiledImage = this.getReferencedTiledImage() || viewport;
                //todo proprietary func from before OSD 2.0, remove? search API
                this.__pixelRatio = tiledImageViewportToImageZoom(tiledImage, zoom);
            }
            return this.__pixelRatio;
        },
        /**
         *
         * @return {string}
         */
        imageLengthToGivenUnits: function(length) {
            //todo what about flexibility in units?
            return getWithUnitRounded(length / this.pixelsPerMeter,
                this.sizeAndTextRenderer === $.ScalebarSizeAndTextRenderer.METRIC_LENGTH ? "m" : "px");
        },

        destroy: function() {
            this._active = false;
            this.viewer.removeHandler("open", this.refreshHandler);
            this.viewer.removeHandler("animation", this.refreshHandler);
            this.viewer.removeHandler("resize", this.refreshHandler);

            document.getElementById("viewer-scale-bar").remove();
        },

        updateOptions: function(options) {
            if (!options) {
                return;
            }
            if (isDefined(options.type)) {
                this.setDrawScalebarFunction(options.type);
            }
            if (isDefined(options.minWidth)) {
                this.setMinWidth(options.minWidth);
            }
            if (isDefined(options.color)) {
                this.color = options.color;
            }
            if (isDefined(options.fontColor)) {
                this.fontColor = options.fontColor;
            }
            if (isDefined(options.backgroundColor)) {
                this.backgroundColor = options.backgroundColor;
            }
            if (isDefined(options.fontSize)) {
                this.fontSize = options.fontSize;
            }
            if (isDefined(options.fontFamily)) {
                this.fontFamily = options.fontFamily;
            }
            if (isDefined(options.barThickness)) {
                this.barThickness = options.barThickness;
            }
            if (isDefined(options.pixelsPerMeter)) {
                this.pixelsPerMeter = options.pixelsPerMeter;
            }
            if (isDefined(options.location)) {
                this.location = options.location;
            }
            if (isDefined(options.xOffset)) {
                this.xOffset = options.xOffset;
            }
            if (isDefined(options.yOffset)) {
                this.yOffset = options.yOffset;
            }
            if (isDefined(options.stayInsideImage)) {
                this.stayInsideImage = options.stayInsideImage;
            }
            if (isDefined(options.sizeAndTextRenderer)) {
                this.sizeAndTextRenderer = options.sizeAndTextRenderer;
            }
        },
        setDrawScalebarFunction: function(type) {
            if (!type) {
                this.drawScalebar = null;
            }
            else if (type === $.ScalebarType.MAP) {
                this.drawScalebar = this.drawMapScalebar;
            } else {
                this.drawScalebar = this.drawMicroscopyScalebar;
            }
        },
        setMinWidth: function(minWidth) {
            this.divElt.style.width = minWidth;
            // Make sure to display the element before getting is width
            this.divElt.style.display = "";
            this.minWidth = this.divElt.offsetWidth;
        },
        /**
         * Refresh the scalebar with the options submitted.
         * @param {ScaleBarConfig} options
         * @param {OpenSeadragon.ScalebarType} options.type The scale bar type.
         */
        refresh: function(options) {
            this.updateOptions(options);

            if (!this.viewer.isOpen() ||
                !this.drawScalebar ||
                !this.pixelsPerMeter ||
                !this.location) {
                this.divElt.style.display = "none";
                return;
            }
            this.divElt.style.display = "";

            var props = this.sizeAndTextRenderer(
                this.pixelsPerMeter * this.imagePixelSizeOnScreen(), this.minWidth
            );
            this.drawScalebar(props.size, props.text);
            var location = this.getScalebarLocation();
            this.divElt.style.left = location.x + "px";
            this.divElt.style.top = location.y + "px";
        },
        drawMicroscopyScalebar: function(size, text) {
            this.divElt.style.fontSize = this.fontSize;
            this.divElt.style.fontFamily = this.fontFamily;
            this.divElt.style.textAlign = "center";
            this.divElt.style.fontWeight = "600";
            this.divElt.style.color = this.fontColor;
            this.divElt.style.border = "none";
            this.divElt.style.borderBottom = this.barThickness + "px solid " + this.color;
            this.divElt.style.backgroundColor = this.backgroundColor;
            this.divElt.innerHTML = text;
            this.divElt.style.width = size + "px";
        },
        drawMapScalebar: function(size, text) {
            this.divElt.style.fontSize = this.fontSize;
            this.divElt.style.fontFamily = this.fontFamily;
            this.divElt.style.textAlign = "center";
            this.divElt.style.color = this.fontColor;
            this.divElt.style.border = this.barThickness + "px solid " + this.color;
            this.divElt.style.borderTop = "none";
            this.divElt.style.backgroundColor = this.backgroundColor;
            this.divElt.innerHTML = text;
            this.divElt.style.width = size + "px";
        },
        /**
         * Compute the location of the scale bar.
         * @returns {OpenSeadragon.Point}
         */
        getScalebarLocation: function() {
            var barWidth = this.divElt.offsetWidth;
            var barHeight = this.divElt.offsetHeight;
            var container = this.viewer.container;
            var x = 0;
            var y = 0;
            var pixel;
            if (this.location === $.ScalebarLocation.TOP_LEFT) {
                if (this.stayInsideImage) {
                    pixel = this.viewer.viewport.pixelFromPoint(
                        new $.Point(0, 0), true);
                    if (!this.viewer.wrapHorizontal) {
                        x = Math.max(pixel.x, 0);
                    }
                    if (!this.viewer.wrapVertical) {
                        y = Math.max(pixel.y, 0);
                    }
                }
                return new $.Point(x + this.xOffset, y + this.yOffset);
            } else if (this.location === $.ScalebarLocation.TOP_RIGHT) {
                x = container.offsetWidth - barWidth;
                if (this.stayInsideImage) {
                    pixel = this.viewer.viewport.pixelFromPoint(
                        new $.Point(1, 0), true);
                    if (!this.viewer.wrapHorizontal) {
                        x = Math.min(x, pixel.x - barWidth);
                    }
                    if (!this.viewer.wrapVertical) {
                        y = Math.max(y, pixel.y);
                    }
                }
                return new $.Point(x - this.xOffset, y + this.yOffset);
            } else if (this.location === $.ScalebarLocation.BOTTOM_RIGHT) {
                x = container.offsetWidth - barWidth;
                y = container.offsetHeight - barHeight;
                if (this.stayInsideImage) {
                    pixel = this.viewer.viewport.pixelFromPoint(
                        new $.Point(1, 1 / this.viewer.source.aspectRatio),
                        true);
                    if (!this.viewer.wrapHorizontal) {
                        x = Math.min(x, pixel.x - barWidth);
                    }
                    if (!this.viewer.wrapVertical) {
                        y = Math.min(y, pixel.y - barHeight);
                    }
                }
                return new $.Point(x - this.xOffset, y - this.yOffset);
            } else if (this.location === $.ScalebarLocation.BOTTOM_LEFT) {
                y = container.offsetHeight - barHeight;
                if (this.stayInsideImage) {
                    pixel = this.viewer.viewport.pixelFromPoint(
                        new $.Point(0, 1 / this.viewer.source.aspectRatio),
                        true);
                    if (!this.viewer.wrapHorizontal) {
                        x = Math.max(x, pixel.x);
                    }
                    if (!this.viewer.wrapVertical) {
                        y = Math.min(y, pixel.y - barHeight);
                    }
                }
                return new $.Point(x + this.xOffset, y - this.yOffset);
            }
        },
        /**
         * Get the rendered scalebar in a canvas.
         * @returns {Element} A canvas containing the scalebar representation
         */
        getAsCanvas: function() {
            var canvas = document.createElement("canvas");
            canvas.width = this.divElt.offsetWidth;
            canvas.height = this.divElt.offsetHeight;
            var context = canvas.getContext("2d");
            context.fillStyle = this.backgroundColor;
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.fillStyle = this.color;
            context.fillRect(0, canvas.height - this.barThickness,
                canvas.width, canvas.height);
            if (this.drawScalebar === this.drawMapScalebar) {
                context.fillRect(0, 0, this.barThickness, canvas.height);
                context.fillRect(canvas.width - this.barThickness, 0,
                    this.barThickness, canvas.height);
            }
            context.font = window.getComputedStyle(this.divElt).font;
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.fillStyle = this.fontColor;
            var hCenter = canvas.width / 2;
            var vCenter = canvas.height / 2;
            context.fillText(this.divElt.textContent, hCenter, vCenter);
            return canvas;
        },
        /**
         * Get a copy of the current OpenSeadragon canvas with the scalebar.
         * @returns {Element} A canvas containing a copy of the current OpenSeadragon canvas with the scalebar
         */
        getImageWithScalebarAsCanvas: function() {
            var imgCanvas = this.viewer.drawer.canvas;
            var newCanvas = document.createElement("canvas");
            newCanvas.width = imgCanvas.width;
            newCanvas.height = imgCanvas.height;
            var newCtx = newCanvas.getContext("2d");
            newCtx.drawImage(imgCanvas, 0, 0);
            var scalebarCanvas = this.getAsCanvas();
            var location = this.getScalebarLocation();
            newCtx.drawImage(scalebarCanvas, location.x, location.y);
            return newCanvas;
        },
    };

    $.ScalebarSizeAndTextRenderer = {
        /**
         * Metric length. From nano meters to kilometers.
         */
        METRIC_LENGTH: function(ppm, minSize) {
            return getScalebarSizeAndTextForMetric("m", ppm, minSize);
        },
        /**
         * Imperial length. Choosing the best unit from thou, inch, foot and mile.
         */
        IMPERIAL_LENGTH: function(ppm, minSize) {
            var maxSize = minSize * 2;
            var ppi = ppm * 0.0254;
            if (maxSize < ppi * 12) {
                if (maxSize < ppi) {
                    var ppt = ppi / 1000;
                    return getScalebarSizeAndText("th", ppt, minSize);
                }
                return getScalebarSizeAndText("in", ppi, minSize);
            }
            var ppf = ppi * 12;
            if (maxSize < ppf * 2000) {
                return getScalebarSizeAndText("ft", ppf, minSize);
            }
            var ppmi = ppf * 5280;
            return getScalebarSizeAndText("mi", ppmi, minSize);
        },
        /**
         * Astronomy units. Choosing the best unit from arcsec, arcminute, and degree
         */
        ASTRONOMY: function(ppa, minSize) {
            var maxSize = minSize * 2;
            if (maxSize < ppa * 60) {
                return getScalebarSizeAndText("\"", ppa, minSize, false, '');
            }
            var ppminutes = ppa * 60;
            if (maxSize < ppminutes * 60) {
                return getScalebarSizeAndText("\'", ppminutes, minSize, false, '');
            }
            var ppd = ppminutes * 60;
            return getScalebarSizeAndText("&#176", ppd, minSize, false, '');
        },
        /**
         * Standard time. Choosing the best unit from second (and metric divisions),
         * minute, hour, day and year.
         */
        STANDARD_TIME: function(pps, minSize) {
            var maxSize = minSize * 2;
            if (maxSize < pps * 60) {
                return getScalebarSizeAndTextForMetric("s", pps, minSize);
            }
            var ppminutes = pps * 60;
            if (maxSize < ppminutes * 60) {
                return getScalebarSizeAndText("minute", ppminutes, minSize, true);
            }
            var pph = ppminutes * 60;
            if (maxSize < pph * 24) {
                return getScalebarSizeAndText("hour", pph, minSize, true);
            }
            var ppd = pph * 24;
            if (maxSize < ppd * 365.25) {
                return getScalebarSizeAndText("day", ppd, minSize, true);
            }
            var ppy = ppd * 365.25;
            return getScalebarSizeAndText("year", ppy, minSize, true);
        },
        /**
         * Generic metric unit. One can use this function to create a new metric
         * scale. For example, here is an implementation of energy levels:
         * function(ppeV, minSize) {
         *   return OpenSeadragon.ScalebarSizeAndTextRenderer.METRIC_GENERIC("eV", ppeV, minSize);
         * }
         */
        METRIC_GENERIC: getScalebarSizeAndTextForMetric
    };

    // Missing TiledImage.viewportToImageZoom function in OSD 2.0.0
    function tiledImageViewportToImageZoom(tiledImage, viewportZoom) {
        var ratio = tiledImage._scaleSpring.current.value *
            tiledImage.viewport._containerInnerSize.x /
            tiledImage.source.dimensions.x;
        return ratio * viewportZoom;
    }

    function getScalebarSizeAndText(unitSuffix, ppm, minSize, handlePlural, spacer) {
        spacer = spacer === undefined ? ' ' : spacer;
        var value = normalize(ppm, minSize);
        var factor = roundSignificand(value / ppm * minSize, 3);
        var size = value * minSize;
        var plural = handlePlural && factor > 1 ? "s" : "";
        return {
            size: size,
            text: factor + spacer + unitSuffix + plural
        };
    }

    function getScalebarSizeAndTextForMetric(unitSuffix, ppm, minSize, shouldFactorizeUnit=true) {
        var value = normalize(ppm, minSize);
        var factor = roundSignificand(value / ppm * minSize, 3);
        var size = value * minSize;
        var valueWithUnit = shouldFactorizeUnit ? getWithUnit(factor, unitSuffix) : getWithSpaces(factor, unitSuffix);
        return {
            size: size,
            text: valueWithUnit
        };
    }

    function normalize(value, minSize) {
        var significand = getSignificand(value);
        var minSizeSign = getSignificand(minSize);
        var result = getSignificand(significand / minSizeSign);
        if (result >= 5) {
            result /= 5;
        }
        if (result >= 4) {
            result /= 4;
        }
        if (result >= 2) {
            result /= 2;
        }
        return result;
    }

    function getSignificand(x) {
        return x * Math.pow(10, Math.ceil(-log10(x)));
    }

    function roundSignificand(x, decimalPlaces) {
        var exponent = -Math.ceil(-log10(x));
        var power = decimalPlaces - exponent;
        var significand = x * Math.pow(10, power);
        // To avoid rounding problems, always work with integers
        if (power < 0) {
            return Math.round(significand) * Math.pow(10, -power);
        }
        return Math.round(significand) / Math.pow(10, power);
    }

    function log10(x) {
        return Math.log(x) / Math.log(10);
    }

    function getWithUnit(value, unitSuffix) {
        if (value < 0.000001) {
            return value * 1000000000 + " n" + unitSuffix;
        }
        if (value < 0.001) {
            return value * 1000000 + " μ" + unitSuffix;
        }
        if (value < 1) {
            return value * 1000 + " m" + unitSuffix;
        }
        if (value < 1000) {
            return value + unitSuffix;
        }
        if (value >= 1000) {
            return value / 1000 + " k" + unitSuffix;
        }
        return getWithSpaces(value / 1000, "k" + unitSuffix);
    }

    function getWithUnitRounded(value, unitSuffix) {
        if (value < 0.000001) {
            return (Math.round(value * 100000000000) / 100) + " n" + unitSuffix;
        }
        if (value < 0.001) {
            return (Math.round(value * 100000000) / 100) + " μ" + unitSuffix;
        }
        if (value < 1) {
            return (Math.round(value * 100000) / 100) + " m" + unitSuffix;
        }
        if (value < 1000) {
            return (Math.round(value * 100) / 100) + unitSuffix;
        }
        if (value >= 1000) {
            return (Math.round(value / 10) / 100) + " k" + unitSuffix;
        }
        return getWithSpaces(Math.round(value) / 1000, "k" + unitSuffix);
    }

    function getWithSpaces(value, unitSuffix) {
        if (value < 0) return "Negative distance!";
        //https://gist.github.com/MSerj/ad23c73f65e3610bbad96a5ac06d4924
        return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " " + unitSuffix;
    }

    function isDefined(variable) {
        return typeof (variable) !== "undefined";
    }
}(OpenSeadragon));
