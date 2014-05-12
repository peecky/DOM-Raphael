/*global WebKitCSSMatrix:false, define:false */
/*jshint forin:true, noarg:true, noempty:true, eqeqeq:true, evil:true, 
    laxbreak:true, bitwise:true, strict:true, undef:true, unused:true, browser:true,
    jquery:true, indent:4, curly:false, maxerr:50 */

/*
 * Attempt to do what Raphael does with DOM elements, so it can be switched in
 * to speed up execution on mobile devices.
 * Only supports the basics and modern WebKit browsers.
 *
 * Dependent on jQuery (tested with 1.9.0)
 * TODO: remove dependency - not really necessary
 *
 * @author Mark Rhodes
 * @company ScottLogic Ltd.
 */

(function (factory) {
    "use strict";
    if (typeof define === 'function' && define.amd) {
        define(["jquery"], factory);
    } else {
        window.DOMRaphael = factory(jQuery);
    }
})(function ($) {
    "use strict";

	var supportsTouch = ('ontouchstart' in window) || window.DocumentTouch && document instanceof window.DocumentTouch; // taken from Modernizr touch test

	if (typeof WebKitCSSMatrix.prototype.toTransformString === 'undefined')
		WebKitCSSMatrix.prototype.toTransformString = function() {
			return '';	// dummy implementation
		};

    //Creates a new absolutely positioned jQuery obj using the given transform matrix and
    //optionally setting it dimensions to a 1px square..
    function createNewAbs$AtPos(transformMatrix, setDimensions) {
        return $("<div>").css({
            position: "absolute",
            top: "0px",
            left: "0px",
			'box-sizing': 'border-box',
            width: setDimensions ? "2px" : "",
            height: setDimensions ? "2px" : "",
            webkitTransformOrigin: "0 0",
            webkitTransform: "" + transformMatrix
        });
    }
    
    //Calculates and returns the transform matrix of the given DOM element, which should be attached
    //to the DOM at the time of calculation.
    function calculateTransformMatrix(x, y, width, height) {
		if (typeof arguments[0] === 'object') {
			var defaultOpts = { x: 0, y: 0, width: 2, height: 2, deg: 0, rcx: 0, rcy: 0, sx: 1, sy: 1 };
			var opts = $.extend({}, defaultOpts, arguments[0]);
			var cx = opts.width * opts.sx / 2;
			var cy = opts.height * opts.sy / 2;
			return new WebKitCSSMatrix()
				////.translate(opts.width * (1 - opts.sx) / 2, opts.height * (1 - opts.sy) / 2)
				//.translate(opts.width / 2 - cx, opts.height / 2 - cy)
				//.translate(opts.x, opts.y)
				//.translate(cx, cy)
				.translate(opts.width / 2 + opts.x, opts.height / 2 + opts.y)
				.rotate(opts.deg)
				.translate(-cx, -cy)
				.scale(opts.width * opts.sx / 2, opts.height * opts.sy / 2)
				;
		}
		else {
	        width = typeof width === "undefined" ? 2 : width;
	        height = typeof height === "undefined" ? 2 : height;
	        return new WebKitCSSMatrix().translate(x, y).scale(width/2, height/2);
		}
    }

    function bindToTransitionEndForSingleRun($el, funcToExec, maxMSTillTransitionEnd) {
		var timeout, fired;
		var wrappedFunc = function () {
            if (fired) {
                return; //should not happen.
            }
            fired = true;
            $el.unbind('webkitTransitionEnd', wrappedFunc);
            clearTimeout(timeout);
            funcToExec();
		};
		$el.bind('webkitTransitionEnd', wrappedFunc);
		timeout = setTimeout(wrappedFunc, maxMSTillTransitionEnd + 200);
	}

    //Returns a new object which is the same as the original, but only contains the
    //allowed properties.
    function filter(obj, allowedProps) {
        var filtered = {};
        for (var prop in obj) {
            if (obj.hasOwnProperty(prop) && allowedProps.indexOf(prop) !== -1) {
                filtered[prop] = obj[prop];
            }
        }
        return filtered;
    }

    //Each element has an unique id so that it can be tracked..
    var nextElemId = 1;
    
    //Regex to remove "px" at the end of values..
    var pxRegEx = /px$/;
    
    //Small +ive constant which we set opacity to instead of 0 to avoid bug.. 
    var opacityEpsilon = 0.0001;

    //Set of functions for all drawable elements..
    var elementFunctions = {

        //Getter/Setter for attributes - matches Raphael's function in terms of parameters..
        attr: function () {
            var arg0 = arguments[0];

            //single setter..
            if (arguments.length > 1) { 
                var props = {};
                props[arg0] = arguments[1];
                return this._CSSFromSVG(props, true);
            }
            if (typeof arg0 === "object") {
                //multi-getter..
                if (arg0 instanceof Array) {
                    return this._getSVGAttrs(arg0);
                } else {
                    //multi-setter..
                    return this._CSSFromSVG(arg0, true);
                }
            } 
            //single getter..
            return this._getSVGAttrs([arg0])[0];
        },

		hide: function() {
			this.$el.hide();
			return this;
		},

		show: function() {
			this.$el.show();
			return this;
		},

        //Removes this element from the DOM..
        remove: function () {
			this._detach();
            this.$el.remove();
            this.canvas.elements.exclude(this);
        },

		_detach: function() {
			var canvas = this.canvas;
			if (this.next) this.next.prev = this.prev;
			else canvas.topElement = this.prev;
			if (this.prev) this.prev.next = this.next;
			else canvas.bottomElement = this.next;
		},

        //Note: currently a rather basic impl and will only transition properties
        //which are known to be hardware acceleratable..
        animate: function (attrs, ms, tween, onComplete) {
            var css = this._CSSFromSVG(attrs),
                filteredCss = filter(css, ["-webkit-transform", "opacity"]),
                $el = this.$el,
                elStyle = $el[0].style;
            
            var transitionStr = "";
            var first = true;
            $.each(filteredCss, function (prop) {
                transitionStr += (first ? "" : ", ") + prop + " " + ms + "ms " + tween; 
                first = false;
            });
            elStyle.webkitTransition = transitionStr;
            elStyle.webkitBackfaceVisibility = "hidden"; //attempt to switch to use hardware-rendering if not before..

            setTimeout(function () {
                //note: this little timeout hack is required for when the element is newly appended and
                //      you've not run window.getComputedStyle on it - in this case alterations to the
                //      transform matrix will not animate.
                $el.css(css); //trigger the transition..
            });
            bindToTransitionEndForSingleRun($el, function () {
                elStyle.webkitTransition = ""; //prevent further changes causing animation..
                if (onComplete) {
                    onComplete();
                }
            }, ms);

            return this;
        },
        
        //Returns the "bounding box" for this element..
        getBBox: function () {
            var attrs = this._getSVGAttrs(["x", "y", "width", "height"]),
                x = attrs[0],
                y = attrs[1],
                width = attrs[2],
                height = attrs[3];

            return {
                x: x,
                y: y,
                x2: x + width,
                y2: y + height,
                width: width,
                height: height
            };
        },
        
        //Stores the given data with this object..
        data: function (key, value) {
            var dataMap = this.dataMap;
            if (typeof value === "undefined") {
                return dataMap[key];
            }
            dataMap[key] = value;
            return this;
        },

		mousedown: function(handler) {
			var element = this;
			var mousedownHandlers = this.eventHandlers.mousedown;
			mousedownHandlers.push(handler);

			if (!this._mousedown) {
				this._mousedown = function(e) {
					for (var i = 0; i < mousedownHandlers.length; i++) {
						mousedownHandlers[i].call(element, e);
					}
				};
				if (supportsTouch) this.$el.on('touchstart', this._mousedown);
				else this.$el.on('mousedown', this._mousedown);
			}
			return this;
		},

		unmousedown: function(handler) {
			var mousedownHandlers = this.eventHandlers.mousedown;
			var pos = mousedownHandlers.indexOf(handler);
			if (pos >= 0) {
				mousedownHandlers.splice(pos, 1);
				if (mousedownHandlers.length === 0 && this._mousedown) {
					if (supportsTouch) this.$el.off('touchstart', this._mousedown);
					else this.$el.off('mousedown', this._mousedown);
					this._mousedown = null;
				}
			}
			return this;
		},

		drag: function(onmove, onstart, onend, mcontext, scontext, econtext) {
			var element = this;
			mcontext = mcontext || element;
			scontext = scontext || element;
			econtext = econtext || element;

			this.eventHandlers.dragMousedown.push({ handler: onstart, context: scontext });
			this.eventHandlers.dragMousemove.push({ handler: onmove, context: mcontext });
			this.eventHandlers.dragMouseup.push({ handler: onend, context: econtext });

			if (!this._onDragStart) {
				this._onDragStart = function(e) {
					var mousedownHandlers = element.eventHandlers.dragMousedown;
					var $this = $(this);
					if ($this.data('dragStartFrom')) return; // already handled

					var x, y;
					if (e.type === 'touchstart') {
						var touch = e.originalEvent.touches[0];
						x = touch.pageX;
						y = touch.pageY;
					}
					else {
						x = e.pageX;
						y = e.pageY;
					}
					var offset = element.canvas.$el.offset();
					x -= offset.left;
					y -= offset.top;
					$this.data('dragStartFrom', { x: x, y: y });
					for (var i = 0; i < mousedownHandlers.length; i++) {
						mousedownHandlers[i].handler.call(mousedownHandlers[i].context, x, y, e);
					}
					element.canvas.draggingElements.push(element);
				};

				if (supportsTouch) this.$el.on('touchstart', this._onDragStart);
				else this.$el.mousedown(this._onDragStart);
			}
			return this;
		},

		undrag: function() {
			if (this._onDragStart) {
				this.eventHandlers.dragMousemove = [];
				this.eventHandlers.dragMousedown = [];
				this.eventHandlers.dragMouseup = [];
				this.$el.off('mousedown', this._onDragStart);
				this._onDragStart = null;
			}
			return this;
		},

		hover: function(f_in, f_out, icontext, ocontext) {
			return this;
		},

		toFront: function() {
			var canvas = this.canvas;
			if (canvas.topElement === this) return this;

			this._detach();
			this.next = null;
			this.prev = canvas.topElement;
			canvas.topElement.next = this;
			canvas.topElement = this;

			this.$el.detach().appendTo(canvas.$el);
			return this;
		},

		toBack: function() {
			var canvas = this.canvas;
			if (canvas.bottomElement === this) return this;

			this._detach();
			this.prev = null;
			this.next = canvas.bottomElement;
			canvas.bottomElement.prev = this;
			canvas.bottomElement = this;

			this.$el.detach().prependTo(canvas.$el);
			return this;
		},

		insertAfter: function(siblingElement) {
			if (this.prev === siblingElement) return this;

			var canvas = this.canvas;
			this._detach();
			this.prev = siblingElement;
			this.next = siblingElement.next;
			siblingElement.next = this;
			if (canvas.topElement === siblingElement) canvas.topElement = this;

			this.$el.detach().insertAfter(siblingElement.$el);
			return this;
		},

		insertBefore: function(siblingElement) {
			console.log(siblingElement);
			if (this.next === siblingElement) return this;

			var canvas = this.canvas;
			this._detach();
			this.prev = siblingElement.prev;
			this.next = siblingElement;
			siblingElement.prev = this;
			if (canvas.bottomElement === siblingElement) canvas.bottomElement = this;

			this.$el.detach().insertBefore(siblingElement.$el);
			return this;
		},

		transform: function(tstr) {
			var paramLength = {
				't': 2, 'T': 2,
				'r': 3, 'R': 3,
				's': 4, 'S': 4
			};
			var regEx = /([tsr])|,?([+-]?\d*(\.\d*(e-\d+)?)?)/gi;
			var match;
			var op, params;
			var x = this.attrs.x;
			var y = this.attrs.y;
			var width = this.attrs.width;
			var height = this.attrs.height;
			var dx, dy;
			var sx, sy, scx, scy;
			var deg, rcx, rcy;
			while ((match = regEx.exec(tstr))) {
				if (!match[0]) break;
				if (match[0] === ',') continue;
				if (match[1]) {
					op = match[1];
					params = [];
				}
				else {
					params.push(parseFloat(match[2]));
					if (paramLength[op] === params.length) {
						switch (op) {
							case 'T': {
								dx = params[0];
								dy = params[1];
							}
							break;

							case 'S': {
								sx = params[0];
								sy = params[1];
								scx = params[2];
								scy = params[3];
							}
							break;

							case 'R': {
								deg = params[0];
								rcx = params[1];
								rcy = params[2];
							}
							break;
						}
					}
				}
			}

			var transformMatrix = calculateTransformMatrix({
				x: x + dx, y: y + dy,
				width: width, height: height,
				deg: deg, rcx: width / 2, rcy: height / 2,
				sx: sx, sy: sy
			});
			this.$el.css({ '-webkitTransform': "" + transformMatrix });
			this.transformMatrix = this.matrix = transformMatrix;
			
			return this;
		},

		_initElement: function(canvas, transformMatrix, type) {
	        var $el = this.$el = createNewAbs$AtPos(transformMatrix, true);
			this.node = $el.get(0);
	        this.id = nextElemId++;
	        this.canvas = canvas;
	        this.type = type;
	        this.dataMap = {};
			this.eventHandlers = {
				mousedown: [],
				dragMousedown: [],
				dragMousemove: [],
				dragMouseup: []
			};
			this._mousedown = null;
			this._onDragStart = null;
			this.attrs = {
				r: 0
			};
			this.matrix = transformMatrix;

	        canvas.$el.append($el);
	        canvas.elements.push(this);

			var topElement = canvas.topElement;
			if (topElement) topElement.next = this;
			this.prev = topElement || null;
			this.next = null;
			canvas.topElement = this;
			if (!canvas.bottomElement) canvas.bottomElement = this;
		},

        //Obtains an array of values for the requested SVG attributes.
        //Note: currently only supports pixel values.
        _getSVGAttrs: function (attrsToGet) {
            var attrs = [],
                transformMatrix = this.transformMatrix,
                elStyle = window.getComputedStyle(this.$el[0]),
                self = this;

            attrsToGet.forEach(function (attr) {
                switch (attr) {
                case "x":
                    attrs.push(transformMatrix.e);
                    break;
                case "y":
                    attrs.push(transformMatrix.f);
                    break;
                case "width":
                    attrs.push(2 * transformMatrix.a);
                    break;
                case "height":
                    attrs.push(2 * transformMatrix.d);
                    break;
                case "fill":
                    attrs.push(elStyle[self.type === "text" ? "color" : "background-color"]);
                    break;
                case "stroke":
                    attrs.push(elStyle["border-color"]);
                    break;
                case "stroke-width":
                    attrs.push(elStyle["border-width"]);
                    break;
                case "opacity":
                    var opacity = elStyle.opacity;
                    attrs.push(opacity === opacityEpsilon ? 0 : opacity);
                    break;
                default:
                    attrs.push(elStyle[attr]);
                }
            });
            
            return attrs;
        },
        
        //Converts the given map of SVG attributes to a map of CSS properties and returns it
        //unless setValues is true, in which case they are applied on this element and this returned.
        _CSSFromSVG: function (attrs, setValues) {
            var css = {},
                $el = this.$el,
                self = this,
                transformMatrix;
			var textAnchorToScore = {
				start: 1,
				middle: 0,
				end: -1
			};
			var dx;
                
            function getTransformMatrix() {
                //clone a new copy if not done so..
                return transformMatrix = transformMatrix || new WebKitCSSMatrix(self.transformMatrix);
            }

            $.each(attrs, function (attr, value) {
                switch (attr) {
                case "x":
                    getTransformMatrix().e = value;
                    break;
                case "y":
                    getTransformMatrix().f = value;
                    break;
                case "width":
                    getTransformMatrix().a = value / 2;
                    break;
                case "height":
                    getTransformMatrix().d = value / 2;
                    break;
                case "fill":
                    css[self.type === "text" ? "color" : "background-color"] = value;
                    break;
                case "stroke":
                    css["border-color"] = value;
                    break;
                case "stroke-width":
                    css["border-width"] = value;
                    break;
                case "opacity":
                    //don't allow zero as a valid value as it causes issues..
                    css.opacity = value === 0 ? opacityEpsilon : value;
                    break;
				case 'cx':
					getTransformMatrix().e = 1 * (value - self.attrs.r);
					break;
				case 'cy':
					getTransformMatrix().f = 1 * (value - self.attrs.r);
					break;
				case 'text-anchor':
					var oldTextAnchor = self.attrs['text-anchor'];
					var moveScore = textAnchorToScore[value] - textAnchorToScore[oldTextAnchor];
					if (moveScore !== 0) {
						dx = self.getBBox().width * moveScore / 2;
						transformMatrix = calculateTransformMatrix(self.attrs.x+dx, self.attrs.y);
					}
					break;
                default:
                    css[attr] = value;
                }
				if (setValues) {
					self.attrs[attr] = value;
					if (dx) {
						self.attrs.x += dx;
					}
				}
            });

            if (transformMatrix) {
                css["-webkit-transform"] = "" + transformMatrix;
            }
            if (setValues) {
                $el.css(css);
                if (transformMatrix) {
                    this.matrix = this.transformMatrix = transformMatrix;
                }
                return this;
            }
            return css;
        }

    };

    //Text class constructor..
    var Text = function (canvas, x, y, text) {
        var transformMatrix = this.transformMatrix = calculateTransformMatrix(x, y);
		this._initElement(canvas, transformMatrix, 'text');
		this.attrs.x = x;
		this.attrs.y = y;
		this.attrs.width = 2;
		this.attrs.height = 2;
		this.attrs.text = text;
		this.attrs['text-anchor'] = 'middle';
		this.$el.css({ display: 'inline-block', width: 'auto', height: 'auto' });

        //Center text around point..
        var textHolder = $('<div>').text(text).css("webkit-transform", "translate(-50%, -50%)")
			.css({ 'white-space': 'pre', font: '10px "Arial"' });
        this.$el.append(textHolder);
    };
    Text.prototype = $.extend({}, elementFunctions, {

        //need to recalc due to fact that top left isn't (x, y)..
        getBBox: function () {
            var bbox = elementFunctions.getBBox.apply(this, arguments),
                halfWidth = bbox.width / 2, halfHeight = bbox.height / 2;

            bbox.x -= halfWidth;
            bbox.x2 -= halfWidth;
            bbox.y -= halfHeight;
            bbox.y2 -= halfHeight;
            return bbox;
        },
        
        //Need to fix as width and height are not accurrate since scale is not important..
        _getSVGAttrs: function (attrsToGet) {
            var $el = this.$el,
                attrs = elementFunctions._getSVGAttrs.apply(this, arguments);

            ["width", "height"].forEach(function (prop) {
                var index = attrsToGet.indexOf(prop);
                if (index !== -1) {
                    attrs[index] = parseFloat($el.css(prop).replace(pxRegEx, ""), 10);
                }
            });
            return attrs;
        }
    });

	var Path = function(canvas, pathString) {
		// dummy implementation of path
        var transformMatrix = this.transformMatrix = calculateTransformMatrix(0, 0, 1, 1);
		this._initElement(canvas, transformMatrix, 'path');
	};
	Path.prototype = elementFunctions;

    //Rectangle class contructor..
    var Rect = function (canvas, x, y, width, height) {
        var transformMatrix = this.transformMatrix = calculateTransformMatrix(x, y, width, height);
		this._initElement(canvas, transformMatrix, 'rect');
    };
    Rect.prototype = elementFunctions;

    var Circle = function (canvas, x, y, r) {
        var transformMatrix = this.transformMatrix = calculateTransformMatrix(x-r, y-r, r*2, r*2);
		this._initElement(canvas, transformMatrix, 'circle');
		this.attrs.r = r;
		this.attrs.cx = x;
		this.attrs.cy = y;
		this.$el.css({
			'border-radius': '50%',
			'border-width': '1px'
		});
    };
    Circle.prototype = elementFunctions;

	var Image = function(canvas, src, x, y, width, height) {
        var transformMatrix = this.transformMatrix = calculateTransformMatrix(x, y, width, height);
		this._initElement(canvas, transformMatrix, 'image');
		this.attrs.x = x;
		this.attrs.y = y;
		this.attrs.width = width;
		this.attrs.height = height;
		this.attrs.src = src;
		this.$el.css({
			'background-image': 'url(' + src + ')',
			'background-repeat': 'no-repeat',
			'background-size': '2px 2px'
		});
	};
    Image.prototype = elementFunctions;
 
    //Set class like Raphael's - for combining elements..
    var Set = function () {
        this.map = {};
    };
    Set.prototype = {

        //Calls the given function on each element of this set..
        forEach: function (fnToCall) {
            $.each(this.map, function (elemId, elem) {
                fnToCall(elem);
            });
        },  
        
        //Adds the given element to this set..
        push: function (elem) {
            this.map[elem.id] = elem;
            return this;
        },
        
        exclude: function (elem) {
            var map = this.map,
                found = map[elem.id]; 
            delete map[elem.id];
            return !!found;
        }
    };

    //add all the element functions to set - return value off but never mind..
    $.each(elementFunctions, function (fnName, fn) {
        Set.prototype[fnName] = function () {
            var args = arguments;
            $.each(this.map, function (elemId, elem) {
                fn.apply(elem, args);
            });
        };
    });

    //Constructor for the canvas class which makes use of the given DOM element..
    var Canvas = function (el, width, height) {
		if (typeof el === 'string') el = '#' + el;
        var $el = this.$el = $(el);
		this.canvas = $el[0];
        this.elements = new Set(); 
		this.draggingElements = [];
		var canvas = this;

        $el.css({
            position: "relative",
            width: width + "px",
            height: height + "px",
            overflow: "hidden"
        });

		function onMouseMove(e) {
			if (canvas.draggingElements.length === 0) return;

			e.preventDefault();
			e.stopPropagation();
			var x, y;
			if (e.type === 'touchmove') {
				var touch = e.originalEvent.touches[0];
				x = touch.pageX;
				y = touch.pageY;
			}
			else {
				x = e.pageX;
				y = e.pageY;
			}

			var offset = canvas.$el.offset();
			x -= offset.left;
			y -= offset.top;
			for (var i = 0; i < canvas.draggingElements.length; i++) {
				var element = canvas.draggingElements[i];
				var dragStartFrom = element.$el.data('dragStartFrom');
				if (!dragStartFrom) continue;

				var mousemoveHandlers = element.eventHandlers.dragMousemove;
				var dx = x - dragStartFrom.x;
				var dy = y - dragStartFrom.y;
				for (var j = 0; j < mousemoveHandlers.length; j++) {
					mousemoveHandlers[j].handler.call(mousemoveHandlers[j].context, dx, dy, x, y, e);
				}
			}
		}

		function onMouseUp(e) {
			if (canvas.draggingElements.length === 0) return;

			for (var i = 0; i < canvas.draggingElements.length; i++) {
				var element = canvas.draggingElements[i];
				var mouseupHandlers = element.eventHandlers.dragMouseup;
				for (var j = 0; j < mouseupHandlers.length; j++) {
					mouseupHandlers[j].handler.call(mouseupHandlers[j].context, e);
				}
				element.$el.removeData('dragStartFrom');
			}
			canvas.draggingElements = [];
		}

		var $document = $(document);
		$document.mousemove(onMouseMove);
		$document.on('touchmove', onMouseMove);
		$document.mouseup(onMouseUp);
		$document.on('touchend', onMouseUp);
		$document.on('touchcancel', onMouseUp);
    };
    Canvas.prototype = {
    
        //Executes the given given for each element of this canvas..
        forEach: function (fnToCall) {
            this.elements.forEach(fnToCall);
        },

        //Returns a new element which has the given text, centered around the given point..
        text: function (x, y, text) {
            return new Text(this, x, y, text);
        },

		path: function(pathString) {
			return new Path(this, pathString);
		},

        rect: function (x, y, width, height) {
            return new Rect(this, x, y, width, height);
        },

		circle: function(x, y, r) {
			return new Circle(this, x, y, r);
		},

		image: function(src, x, y, width, height) {
			return new Image(this, src, x, y, width, height);
		},

        set: function () {
            return new Set();
        },

		remove: function() {
			this.elements.forEach(function (elem) {
				elem.remove();
			});
		}
    };

    //Constructs a new canvas using the given element..
    var DOMRaphael = function (el, width, height) {
		for (var k in DOMRaphael.fn) {
			if (typeof Canvas.prototype[k] === 'undefined') {
				Canvas.prototype[k] = DOMRaphael.fn[k];
			}
		}
        return new Canvas(el, width, height);
    };
    
    //Returns whether or not the given bounding boxes intersect..
    DOMRaphael.isBBoxIntersect = function (a, b) {
        //intersect x..
        if (a.x < b.x) {
            if (a.x2 <= b.x) {
                return false;
            }
        } else if (b.x2 <= a.x) {
            return false;
        }
        //intersect y..
        if (a.y < b.y) {
            if (a.y2 <= b.y) {
                return false;
            }
        } else if (b.y2 <= a.y) {
            return false;
        }
        return true;
    };

	DOMRaphael.fn = {};

    return DOMRaphael;
});
