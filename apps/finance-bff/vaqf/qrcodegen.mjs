// ../../mezana-space/var/www/mezana-crm/frontend/node_modules/@babel/runtime/helpers/esm/arrayLikeToArray.js
function _arrayLikeToArray(r, a) {
  (null == a || a > r.length) && (a = r.length);
  for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e];
  return n;
}

// ../../mezana-space/var/www/mezana-crm/frontend/node_modules/@babel/runtime/helpers/esm/unsupportedIterableToArray.js
function _unsupportedIterableToArray(r, a) {
  if (r) {
    if ("string" == typeof r) return _arrayLikeToArray(r, a);
    var t = {}.toString.call(r).slice(8, -1);
    return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray(r, a) : void 0;
  }
}

// ../../mezana-space/var/www/mezana-crm/frontend/node_modules/@babel/runtime/helpers/esm/createForOfIteratorHelper.js
function _createForOfIteratorHelper(r, e) {
  var t = "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"];
  if (!t) {
    if (Array.isArray(r) || (t = _unsupportedIterableToArray(r)) || e && r && "number" == typeof r.length) {
      t && (r = t);
      var _n = 0, F = function F2() {
      };
      return {
        s: F,
        n: function n() {
          return _n >= r.length ? {
            done: true
          } : {
            done: false,
            value: r[_n++]
          };
        },
        e: function e2(r2) {
          throw r2;
        },
        f: F
      };
    }
    throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
  }
  var o, a = true, u = false;
  return {
    s: function s() {
      t = t.call(r);
    },
    n: function n() {
      var r2 = t.next();
      return a = r2.done, r2;
    },
    e: function e2(r2) {
      u = true, o = r2;
    },
    f: function f() {
      try {
        a || null == t["return"] || t["return"]();
      } finally {
        if (u) throw o;
      }
    }
  };
}

// ../../mezana-space/var/www/mezana-crm/frontend/node_modules/@babel/runtime/helpers/esm/classCallCheck.js
function _classCallCheck(a, n) {
  if (!(a instanceof n)) throw new TypeError("Cannot call a class as a function");
}

// ../../mezana-space/var/www/mezana-crm/frontend/node_modules/@babel/runtime/helpers/esm/typeof.js
function _typeof(o) {
  "@babel/helpers - typeof";
  return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o2) {
    return typeof o2;
  } : function(o2) {
    return o2 && "function" == typeof Symbol && o2.constructor === Symbol && o2 !== Symbol.prototype ? "symbol" : typeof o2;
  }, _typeof(o);
}

// ../../mezana-space/var/www/mezana-crm/frontend/node_modules/@babel/runtime/helpers/esm/toPrimitive.js
function toPrimitive(t, r) {
  if ("object" != _typeof(t) || !t) return t;
  var e = t[Symbol.toPrimitive];
  if (void 0 !== e) {
    var i = e.call(t, r || "default");
    if ("object" != _typeof(i)) return i;
    throw new TypeError("@@toPrimitive must return a primitive value.");
  }
  return ("string" === r ? String : Number)(t);
}

// ../../mezana-space/var/www/mezana-crm/frontend/node_modules/@babel/runtime/helpers/esm/toPropertyKey.js
function toPropertyKey(t) {
  var i = toPrimitive(t, "string");
  return "symbol" == _typeof(i) ? i : i + "";
}

// ../../mezana-space/var/www/mezana-crm/frontend/node_modules/@babel/runtime/helpers/esm/createClass.js
function _defineProperties(e, r) {
  for (var t = 0; t < r.length; t++) {
    var o = r[t];
    o.enumerable = o.enumerable || false, o.configurable = true, "value" in o && (o.writable = true), Object.defineProperty(e, toPropertyKey(o.key), o);
  }
}
function _createClass(e, r, t) {
  return r && _defineProperties(e.prototype, r), t && _defineProperties(e, t), Object.defineProperty(e, "prototype", {
    writable: false
  }), e;
}

// ../../mezana-space/var/www/mezana-crm/frontend/node_modules/@babel/runtime/helpers/esm/defineProperty.js
function _defineProperty(e, r, t) {
  return (r = toPropertyKey(r)) in e ? Object.defineProperty(e, r, {
    value: t,
    enumerable: true,
    configurable: true,
    writable: true
  }) : e[r] = t, e;
}

// ../../mezana-space/var/www/mezana-crm/frontend/node_modules/@rc-component/qrcode/es/libs/qrcodegen.js
var _class;
var _class2;
function appendBits(val, len, bb) {
  if (len < 0 || len > 31 || val >>> len != 0) {
    throw new RangeError("Value out of range");
  }
  for (var i = len - 1; i >= 0; i--) {
    bb.push(val >>> i & 1);
  }
}
function getBit(x, i) {
  return (x >>> i & 1) != 0;
}
function assert(cond) {
  if (!cond) {
    throw new Error("Assertion error");
  }
}
var Mode = /* @__PURE__ */ (function() {
  function Mode2(modeBits, numBitsCharCount) {
    _classCallCheck(this, Mode2);
    _defineProperty(this, "modeBits", void 0);
    _defineProperty(this, "numBitsCharCount", void 0);
    this.modeBits = modeBits;
    this.numBitsCharCount = numBitsCharCount;
  }
  _createClass(Mode2, [{
    key: "numCharCountBits",
    value: function numCharCountBits(ver) {
      return this.numBitsCharCount[Math.floor((ver + 7) / 17)];
    }
  }]);
  return Mode2;
})();
_class = Mode;
_defineProperty(Mode, "NUMERIC", new _class(1, [10, 12, 14]));
_defineProperty(Mode, "ALPHANUMERIC", new _class(2, [9, 11, 13]));
_defineProperty(Mode, "BYTE", new _class(4, [8, 16, 16]));
_defineProperty(Mode, "KANJI", new _class(8, [8, 10, 12]));
_defineProperty(Mode, "ECI", new _class(7, [0, 0, 0]));
var Ecc = /* @__PURE__ */ _createClass(function Ecc2(ordinal, formatBits) {
  _classCallCheck(this, Ecc2);
  _defineProperty(this, "ordinal", void 0);
  _defineProperty(this, "formatBits", void 0);
  this.ordinal = ordinal;
  this.formatBits = formatBits;
});
_class2 = Ecc;
_defineProperty(Ecc, "LOW", new _class2(0, 1));
_defineProperty(Ecc, "MEDIUM", new _class2(1, 0));
_defineProperty(Ecc, "QUARTILE", new _class2(2, 3));
_defineProperty(Ecc, "HIGH", new _class2(3, 2));
var QrSegment = /* @__PURE__ */ (function() {
  function QrSegment2(mode, numChars, bitData) {
    _classCallCheck(this, QrSegment2);
    _defineProperty(this, "mode", void 0);
    _defineProperty(this, "numChars", void 0);
    _defineProperty(this, "bitData", void 0);
    this.mode = mode;
    this.numChars = numChars;
    this.bitData = bitData;
    if (numChars < 0) {
      throw new RangeError("Invalid argument");
    }
    this.bitData = bitData.slice();
  }
  _createClass(QrSegment2, [{
    key: "getData",
    value: function getData() {
      return this.bitData.slice();
    }
    // (Package-private) Calculates and returns the number of bits needed to encode the given segments at
    // the given version. The result is infinity if a segment has too many characters to fit its length field.
  }], [{
    key: "makeBytes",
    value: (
      /*-- Static factory functions (mid level) --*/
      // Returns a segment representing the given binary data encoded in
      // byte mode. All input byte arrays are acceptable. Any text string
      // can be converted to UTF-8 bytes and encoded as a byte mode segment.
      function makeBytes(data) {
        var bb = [];
        var _iterator = _createForOfIteratorHelper(data), _step;
        try {
          for (_iterator.s(); !(_step = _iterator.n()).done; ) {
            var b = _step.value;
            appendBits(b, 8, bb);
          }
        } catch (err) {
          _iterator.e(err);
        } finally {
          _iterator.f();
        }
        return new QrSegment2(Mode.BYTE, data.length, bb);
      }
    )
    // Returns a segment representing the given string of decimal digits encoded in numeric mode.
  }, {
    key: "makeNumeric",
    value: function makeNumeric(digits) {
      if (!QrSegment2.isNumeric(digits)) {
        throw new RangeError("String contains non-numeric characters");
      }
      var bb = [];
      for (var i = 0; i < digits.length; ) {
        var n = Math.min(digits.length - i, 3);
        appendBits(parseInt(digits.substring(i, i + n), 10), n * 3 + 1, bb);
        i += n;
      }
      return new QrSegment2(Mode.NUMERIC, digits.length, bb);
    }
    // Returns a segment representing the given text string encoded in alphanumeric mode.
    // The characters allowed are: 0 to 9, A to Z (uppercase only), space,
    // dollar, percent, asterisk, plus, hyphen, period, slash, colon.
  }, {
    key: "makeAlphanumeric",
    value: function makeAlphanumeric(text) {
      if (!QrSegment2.isAlphanumeric(text)) {
        throw new RangeError("String contains unencodable characters in alphanumeric mode");
      }
      var bb = [];
      var i;
      for (i = 0; i + 2 <= text.length; i += 2) {
        var temp = QrSegment2.ALPHANUMERIC_CHARSET.indexOf(text.charAt(i)) * 45;
        temp += QrSegment2.ALPHANUMERIC_CHARSET.indexOf(text.charAt(i + 1));
        appendBits(temp, 11, bb);
      }
      if (i < text.length) {
        appendBits(QrSegment2.ALPHANUMERIC_CHARSET.indexOf(text.charAt(i)), 6, bb);
      }
      return new QrSegment2(Mode.ALPHANUMERIC, text.length, bb);
    }
    // Returns a new mutable list of zero or more segments to represent the given Unicode text string.
    // The result may use various segment modes and switch modes to optimize the length of the bit stream.
  }, {
    key: "makeSegments",
    value: function makeSegments(text) {
      if (text == "") {
        return [];
      } else if (QrSegment2.isNumeric(text)) {
        return [QrSegment2.makeNumeric(text)];
      } else if (QrSegment2.isAlphanumeric(text)) {
        return [QrSegment2.makeAlphanumeric(text)];
      } else {
        return [QrSegment2.makeBytes(QrSegment2.toUtf8ByteArray(text))];
      }
    }
    // Returns a segment representing an Extended Channel Interpretation
    // (ECI) designator with the given assignment value.
  }, {
    key: "makeEci",
    value: function makeEci(assignVal) {
      var bb = [];
      if (assignVal < 0) {
        throw new RangeError("ECI assignment value out of range");
      } else if (assignVal < 1 << 7) {
        appendBits(assignVal, 8, bb);
      } else if (assignVal < 1 << 14) {
        appendBits(2, 2, bb);
        appendBits(assignVal, 14, bb);
      } else if (assignVal < 1e6) {
        appendBits(6, 3, bb);
        appendBits(assignVal, 21, bb);
      } else {
        throw new RangeError("ECI assignment value out of range");
      }
      return new QrSegment2(Mode.ECI, 0, bb);
    }
    // Tests whether the given string can be encoded as a segment in numeric mode.
    // A string is encodable iff each character is in the range 0 to 9.
  }, {
    key: "isNumeric",
    value: function isNumeric(text) {
      return QrSegment2.NUMERIC_REGEX.test(text);
    }
    // Tests whether the given string can be encoded as a segment in alphanumeric mode.
    // A string is encodable iff each character is in the following set: 0 to 9, A to Z
    // (uppercase only), space, dollar, percent, asterisk, plus, hyphen, period, slash, colon.
  }, {
    key: "isAlphanumeric",
    value: function isAlphanumeric(text) {
      return QrSegment2.ALPHANUMERIC_REGEX.test(text);
    }
  }, {
    key: "getTotalBits",
    value: function getTotalBits(segs, version) {
      var result = 0;
      var _iterator2 = _createForOfIteratorHelper(segs), _step2;
      try {
        for (_iterator2.s(); !(_step2 = _iterator2.n()).done; ) {
          var seg = _step2.value;
          var ccbits = seg.mode.numCharCountBits(version);
          if (seg.numChars >= 1 << ccbits) {
            return Infinity;
          }
          result += 4 + ccbits + seg.bitData.length;
        }
      } catch (err) {
        _iterator2.e(err);
      } finally {
        _iterator2.f();
      }
      return result;
    }
    // Returns a new array of bytes representing the given string encoded in UTF-8.
  }, {
    key: "toUtf8ByteArray",
    value: function toUtf8ByteArray(input) {
      var str = encodeURI(input);
      var result = [];
      for (var i = 0; i < str.length; i++) {
        if (str.charAt(i) != "%") {
          result.push(str.charCodeAt(i));
        } else {
          result.push(parseInt(str.substring(i + 1, i + 3), 16));
          i += 2;
        }
      }
      return result;
    }
    /*-- Constants --*/
    // Describes precisely all strings that are encodable in numeric mode.
  }]);
  return QrSegment2;
})();
_defineProperty(QrSegment, "NUMERIC_REGEX", /^[0-9]*$/);
_defineProperty(QrSegment, "ALPHANUMERIC_REGEX", /^[A-Z0-9 $%*+.\/:-]*$/);
_defineProperty(QrSegment, "ALPHANUMERIC_CHARSET", "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:");
var QrCode = /* @__PURE__ */ (function() {
  function QrCode2(version, errorCorrectionLevel, dataCodewords, oriMsk) {
    _classCallCheck(this, QrCode2);
    _defineProperty(this, "size", void 0);
    _defineProperty(this, "mask", void 0);
    _defineProperty(this, "modules", []);
    _defineProperty(this, "isFunction", []);
    _defineProperty(this, "version", void 0);
    _defineProperty(this, "errorCorrectionLevel", void 0);
    var msk = oriMsk;
    this.version = version;
    this.errorCorrectionLevel = errorCorrectionLevel;
    if (version < QrCode2.MIN_VERSION || version > QrCode2.MAX_VERSION) {
      throw new RangeError("Version value out of range");
    }
    if (msk < -1 || msk > 7) {
      throw new RangeError("Mask value out of range");
    }
    this.size = version * 4 + 17;
    var row = [];
    for (var i = 0; i < this.size; i++) {
      row.push(false);
    }
    for (var _i = 0; _i < this.size; _i++) {
      this.modules.push(row.slice());
      this.isFunction.push(row.slice());
    }
    this.drawFunctionPatterns();
    var allCodewords = this.addEccAndInterleave(dataCodewords);
    this.drawCodewords(allCodewords);
    if (msk == -1) {
      var minPenalty = 1e9;
      for (var _i2 = 0; _i2 < 8; _i2++) {
        this.applyMask(_i2);
        this.drawFormatBits(_i2);
        var penalty = this.getPenaltyScore();
        if (penalty < minPenalty) {
          msk = _i2;
          minPenalty = penalty;
        }
        this.applyMask(_i2);
      }
    }
    assert(0 <= msk && msk <= 7);
    this.mask = msk;
    this.applyMask(msk);
    this.drawFormatBits(msk);
    this.isFunction = [];
  }
  _createClass(QrCode2, [{
    key: "getModule",
    value: function getModule(x, y) {
      return 0 <= x && x < this.size && 0 <= y && y < this.size && this.modules[y][x];
    }
    // Modified to expose modules for easy access
  }, {
    key: "getModules",
    value: function getModules() {
      return this.modules;
    }
    /*-- Private helper methods for constructor: Drawing function modules --*/
    // Reads this object's version field, and draws and marks all function modules.
  }, {
    key: "drawFunctionPatterns",
    value: function drawFunctionPatterns() {
      for (var i = 0; i < this.size; i++) {
        this.setFunctionModule(6, i, i % 2 == 0);
        this.setFunctionModule(i, 6, i % 2 == 0);
      }
      this.drawFinderPattern(3, 3);
      this.drawFinderPattern(this.size - 4, 3);
      this.drawFinderPattern(3, this.size - 4);
      var alignPatPos = this.getAlignmentPatternPositions();
      var numAlign = alignPatPos.length;
      for (var _i3 = 0; _i3 < numAlign; _i3++) {
        for (var j = 0; j < numAlign; j++) {
          if (!(_i3 == 0 && j == 0 || _i3 == 0 && j == numAlign - 1 || _i3 == numAlign - 1 && j == 0)) {
            this.drawAlignmentPattern(alignPatPos[_i3], alignPatPos[j]);
          }
        }
      }
      this.drawFormatBits(0);
      this.drawVersion();
    }
    // Draws two copies of the format bits (with its own error correction code)
    // based on the given mask and this object's error correction level field.
  }, {
    key: "drawFormatBits",
    value: function drawFormatBits(mask) {
      var data = this.errorCorrectionLevel.formatBits << 3 | mask;
      var rem = data;
      for (var i = 0; i < 10; i++) {
        rem = rem << 1 ^ (rem >>> 9) * 1335;
      }
      var bits = (data << 10 | rem) ^ 21522;
      assert(bits >>> 15 == 0);
      for (var _i4 = 0; _i4 <= 5; _i4++) {
        this.setFunctionModule(8, _i4, getBit(bits, _i4));
      }
      this.setFunctionModule(8, 7, getBit(bits, 6));
      this.setFunctionModule(8, 8, getBit(bits, 7));
      this.setFunctionModule(7, 8, getBit(bits, 8));
      for (var _i5 = 9; _i5 < 15; _i5++) {
        this.setFunctionModule(14 - _i5, 8, getBit(bits, _i5));
      }
      for (var _i6 = 0; _i6 < 8; _i6++) {
        this.setFunctionModule(this.size - 1 - _i6, 8, getBit(bits, _i6));
      }
      for (var _i7 = 8; _i7 < 15; _i7++) {
        this.setFunctionModule(8, this.size - 15 + _i7, getBit(bits, _i7));
      }
      this.setFunctionModule(8, this.size - 8, true);
    }
    // Draws two copies of the version bits (with its own error correction code),
    // based on this object's version field, iff 7 <= version <= 40.
  }, {
    key: "drawVersion",
    value: function drawVersion() {
      if (this.version < 7) {
        return;
      }
      var rem = this.version;
      for (var i = 0; i < 12; i++) {
        rem = rem << 1 ^ (rem >>> 11) * 7973;
      }
      var bits = this.version << 12 | rem;
      assert(bits >>> 18 == 0);
      for (var _i8 = 0; _i8 < 18; _i8++) {
        var color = getBit(bits, _i8);
        var a = this.size - 11 + _i8 % 3;
        var b = Math.floor(_i8 / 3);
        this.setFunctionModule(a, b, color);
        this.setFunctionModule(b, a, color);
      }
    }
    // Draws a 9*9 finder pattern including the border separator,
    // with the center module at (x, y). Modules can be out of bounds.
  }, {
    key: "drawFinderPattern",
    value: function drawFinderPattern(x, y) {
      for (var dy = -4; dy <= 4; dy++) {
        for (var dx = -4; dx <= 4; dx++) {
          var dist = Math.max(Math.abs(dx), Math.abs(dy));
          var xx = x + dx;
          var yy = y + dy;
          if (0 <= xx && xx < this.size && 0 <= yy && yy < this.size) {
            this.setFunctionModule(xx, yy, dist != 2 && dist != 4);
          }
        }
      }
    }
    // Draws a 5*5 alignment pattern, with the center module
    // at (x, y). All modules must be in bounds.
  }, {
    key: "drawAlignmentPattern",
    value: function drawAlignmentPattern(x, y) {
      for (var dy = -2; dy <= 2; dy++) {
        for (var dx = -2; dx <= 2; dx++) this.setFunctionModule(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) != 1);
      }
    }
    // Sets the color of a module and marks it as a function module.
    // Only used by the constructor. Coordinates must be in bounds.
  }, {
    key: "setFunctionModule",
    value: function setFunctionModule(x, y, isDark) {
      this.modules[y][x] = isDark;
      this.isFunction[y][x] = true;
    }
    /*-- Private helper methods for constructor: Codewords and masking --*/
    // Returns a new byte string representing the given data with the appropriate error correction
    // codewords appended to it, based on this object's version and error correction level.
  }, {
    key: "addEccAndInterleave",
    value: function addEccAndInterleave(data) {
      var ver = this.version;
      var ecl = this.errorCorrectionLevel;
      if (data.length != QrCode2.getNumDataCodewords(ver, ecl)) {
        throw new RangeError("Invalid argument");
      }
      var numBlocks = QrCode2.NUM_ERROR_CORRECTION_BLOCKS[ecl.ordinal][ver];
      var blockEccLen = QrCode2.ECC_CODEWORDS_PER_BLOCK[ecl.ordinal][ver];
      var rawCodewords = Math.floor(QrCode2.getNumRawDataModules(ver) / 8);
      var numShortBlocks = numBlocks - rawCodewords % numBlocks;
      var shortBlockLen = Math.floor(rawCodewords / numBlocks);
      var blocks = [];
      var rsDiv = QrCode2.reedSolomonComputeDivisor(blockEccLen);
      for (var i = 0, k = 0; i < numBlocks; i++) {
        var dat = data.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1));
        k += dat.length;
        var ecc = QrCode2.reedSolomonComputeRemainder(dat, rsDiv);
        if (i < numShortBlocks) {
          dat.push(0);
        }
        blocks.push(dat.concat(ecc));
      }
      var result = [];
      var _loop = function _loop2(_i92) {
        blocks.forEach(function(block, j) {
          if (_i92 != shortBlockLen - blockEccLen || j >= numShortBlocks) {
            result.push(block[_i92]);
          }
        });
      };
      for (var _i9 = 0; _i9 < blocks[0].length; _i9++) {
        _loop(_i9);
      }
      assert(result.length == rawCodewords);
      return result;
    }
    // Draws the given sequence of 8-bit codewords (data and error correction) onto the entire
    // data area of this QR Code. Function modules need to be marked off before this is called.
  }, {
    key: "drawCodewords",
    value: function drawCodewords(data) {
      if (data.length != Math.floor(QrCode2.getNumRawDataModules(this.version) / 8)) {
        throw new RangeError("Invalid argument");
      }
      var i = 0;
      for (var right = this.size - 1; right >= 1; right -= 2) {
        if (right == 6) {
          right = 5;
        }
        for (var vert = 0; vert < this.size; vert++) {
          for (var j = 0; j < 2; j++) {
            var x = right - j;
            var upward = (right + 1 & 2) == 0;
            var y = upward ? this.size - 1 - vert : vert;
            if (!this.isFunction[y][x] && i < data.length * 8) {
              this.modules[y][x] = getBit(data[i >>> 3], 7 - (i & 7));
              i++;
            }
          }
        }
      }
      assert(i == data.length * 8);
    }
    // XORs the codeword modules in this QR Code with the given mask pattern.
    // The function modules must be marked and the codeword bits must be drawn
    // before masking. Due to the arithmetic of XOR, calling applyMask() with
    // the same mask value a second time will undo the mask. A final well-formed
    // QR Code needs exactly one (not zero, two, etc.) mask applied.
  }, {
    key: "applyMask",
    value: function applyMask(mask) {
      if (mask < 0 || mask > 7) {
        throw new RangeError("Mask value out of range");
      }
      for (var y = 0; y < this.size; y++) {
        for (var x = 0; x < this.size; x++) {
          var invert = void 0;
          switch (mask) {
            case 0:
              invert = (x + y) % 2 == 0;
              break;
            case 1:
              invert = y % 2 == 0;
              break;
            case 2:
              invert = x % 3 == 0;
              break;
            case 3:
              invert = (x + y) % 3 == 0;
              break;
            case 4:
              invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 == 0;
              break;
            case 5:
              invert = x * y % 2 + x * y % 3 == 0;
              break;
            case 6:
              invert = (x * y % 2 + x * y % 3) % 2 == 0;
              break;
            case 7:
              invert = ((x + y) % 2 + x * y % 3) % 2 == 0;
              break;
            default:
              throw new Error("Unreachable");
          }
          if (!this.isFunction[y][x] && invert) {
            this.modules[y][x] = !this.modules[y][x];
          }
        }
      }
    }
    // Calculates and returns the penalty score based on state of this QR Code's current modules.
    // This is used by the automatic mask choice algorithm to find the mask pattern that yields the lowest score.
  }, {
    key: "getPenaltyScore",
    value: function getPenaltyScore() {
      var result = 0;
      for (var y = 0; y < this.size; y++) {
        var runColor = false;
        var runX = 0;
        var runHistory = [0, 0, 0, 0, 0, 0, 0];
        for (var x = 0; x < this.size; x++) {
          if (this.modules[y][x] == runColor) {
            runX++;
            if (runX == 5) {
              result += QrCode2.PENALTY_N1;
            } else if (runX > 5) {
              result++;
            }
          } else {
            this.finderPenaltyAddHistory(runX, runHistory);
            if (!runColor) {
              result += this.finderPenaltyCountPatterns(runHistory) * QrCode2.PENALTY_N3;
            }
            runColor = this.modules[y][x];
            runX = 1;
          }
        }
        result += this.finderPenaltyTerminateAndCount(runColor, runX, runHistory) * QrCode2.PENALTY_N3;
      }
      for (var _x = 0; _x < this.size; _x++) {
        var _runColor = false;
        var runY = 0;
        var _runHistory = [0, 0, 0, 0, 0, 0, 0];
        for (var _y = 0; _y < this.size; _y++) {
          if (this.modules[_y][_x] == _runColor) {
            runY++;
            if (runY == 5) {
              result += QrCode2.PENALTY_N1;
            } else if (runY > 5) {
              result++;
            }
          } else {
            this.finderPenaltyAddHistory(runY, _runHistory);
            if (!_runColor) {
              result += this.finderPenaltyCountPatterns(_runHistory) * QrCode2.PENALTY_N3;
            }
            _runColor = this.modules[_y][_x];
            runY = 1;
          }
        }
        result += this.finderPenaltyTerminateAndCount(_runColor, runY, _runHistory) * QrCode2.PENALTY_N3;
      }
      for (var _y2 = 0; _y2 < this.size - 1; _y2++) {
        for (var _x2 = 0; _x2 < this.size - 1; _x2++) {
          var color = this.modules[_y2][_x2];
          if (color == this.modules[_y2][_x2 + 1] && color == this.modules[_y2 + 1][_x2] && color == this.modules[_y2 + 1][_x2 + 1]) {
            result += QrCode2.PENALTY_N2;
          }
        }
      }
      var dark = 0;
      var _iterator3 = _createForOfIteratorHelper(this.modules), _step3;
      try {
        for (_iterator3.s(); !(_step3 = _iterator3.n()).done; ) {
          var row = _step3.value;
          dark = row.reduce(function(sum, color2) {
            return sum + (color2 ? 1 : 0);
          }, dark);
        }
      } catch (err) {
        _iterator3.e(err);
      } finally {
        _iterator3.f();
      }
      var total = this.size * this.size;
      var k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
      assert(0 <= k && k <= 9);
      result += k * QrCode2.PENALTY_N4;
      assert(0 <= result && result <= 2568888);
      return result;
    }
    /*-- Private helper functions --*/
    // Returns an ascending list of positions of alignment patterns for this version number.
    // Each position is in the range [0,177), and are used on both the x and y axes.
    // This could be implemented as lookup table of 40 variable-length lists of numberegers.
  }, {
    key: "getAlignmentPatternPositions",
    value: function getAlignmentPatternPositions() {
      if (this.version == 1) {
        return [];
      } else {
        var numAlign = Math.floor(this.version / 7) + 2;
        var step = this.version == 32 ? 26 : Math.ceil((this.version * 4 + 4) / (numAlign * 2 - 2)) * 2;
        var result = [6];
        for (var pos = this.size - 7; result.length < numAlign; pos -= step) {
          result.splice(1, 0, pos);
        }
        return result;
      }
    }
    // Returns the number of data bits that can be stored in a QR Code of the given version number, after
    // all function modules are excluded. This includes remainder bits, so it might not be a multiple of 8.
    // The result is in the range [208, 29648]. This could be implemented as a 40-entry lookup table.
  }, {
    key: "finderPenaltyCountPatterns",
    value: (
      // Can only be called immediately after a light run is added, and
      // returns either 0, 1, or 2. A helper function for getPenaltyScore().
      function finderPenaltyCountPatterns(runHistory) {
        var n = runHistory[1];
        assert(n <= this.size * 3);
        var core = n > 0 && runHistory[2] == n && runHistory[3] == n * 3 && runHistory[4] == n && runHistory[5] == n;
        return (core && runHistory[0] >= n * 4 && runHistory[6] >= n ? 1 : 0) + (core && runHistory[6] >= n * 4 && runHistory[0] >= n ? 1 : 0);
      }
    )
    // Must be called at the end of a line (row or column) of modules. A helper function for getPenaltyScore().
  }, {
    key: "finderPenaltyTerminateAndCount",
    value: function finderPenaltyTerminateAndCount(currentRunColor, oriCurrentRunLength, runHistory) {
      var currentRunLength = oriCurrentRunLength;
      if (currentRunColor) {
        this.finderPenaltyAddHistory(currentRunLength, runHistory);
        currentRunLength = 0;
      }
      currentRunLength += this.size;
      this.finderPenaltyAddHistory(currentRunLength, runHistory);
      return this.finderPenaltyCountPatterns(runHistory);
    }
    // Pushes the given value to the front and drops the last value. A helper function for getPenaltyScore().
  }, {
    key: "finderPenaltyAddHistory",
    value: function finderPenaltyAddHistory(oriCurrentRunLength, runHistory) {
      var currentRunLength = oriCurrentRunLength;
      if (runHistory[0] == 0) {
        currentRunLength += this.size;
      }
      runHistory.pop();
      runHistory.unshift(currentRunLength);
    }
    /*-- Constants and tables --*/
    // The minimum version number supported in the QR Code Model 2 standard.
  }], [{
    key: "encodeText",
    value: (
      /*-- Static factory functions (high level) --*/
      // Returns a QR Code representing the given Unicode text string at the given error correction level.
      // As a conservative upper bound, this function is guaranteed to succeed for strings that have 738 or fewer
      // Unicode code ponumbers (not UTF-16 code units) if the low error correction level is used. The smallest possible
      // QR Code version is automatically chosen for the output. The ECC level of the result may be higher than the
      // ecl argument if it can be done without increasing the version.
      function encodeText(text, ecl) {
        var segs = QrSegment.makeSegments(text);
        return QrCode2.encodeSegments(segs, ecl);
      }
    )
    // Returns a QR Code representing the given binary data at the given error correction level.
    // This function always encodes using the binary segment mode, not any text mode. The maximum number of
    // bytes allowed is 2953. The smallest possible QR Code version is automatically chosen for the output.
    // The ECC level of the result may be higher than the ecl argument if it can be done without increasing the version.
  }, {
    key: "encodeBinary",
    value: function encodeBinary(data, ecl) {
      var seg = QrSegment.makeBytes(data);
      return QrCode2.encodeSegments([seg], ecl);
    }
    /*-- Static factory functions (mid level) --*/
    // Returns a QR Code representing the given segments with the given encoding parameters.
    // The smallest possible QR Code version within the given range is automatically
    // chosen for the output. Iff boostEcl is true, then the ECC level of the result
    // may be higher than the ecl argument if it can be done without increasing the
    // version. The mask number is either between 0 to 7 (inclusive) to force that
    // mask, or -1 to automatically choose an appropriate mask (which may be slow).
    // This function allows the user to create a custom sequence of segments that switches
    // between modes (such as alphanumeric and byte) to encode text in less space.
    // This is a mid-level API; the high-level API is encodeText() and encodeBinary().
  }, {
    key: "encodeSegments",
    value: function encodeSegments(segs, oriEcl) {
      var minVersion = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : 1;
      var maxVersion = arguments.length > 3 && arguments[3] !== void 0 ? arguments[3] : 40;
      var mask = arguments.length > 4 && arguments[4] !== void 0 ? arguments[4] : -1;
      var boostEcl = arguments.length > 5 && arguments[5] !== void 0 ? arguments[5] : true;
      if (!(QrCode2.MIN_VERSION <= minVersion && minVersion <= maxVersion && maxVersion <= QrCode2.MAX_VERSION) || mask < -1 || mask > 7) {
        throw new RangeError("Invalid value");
      }
      var version;
      var dataUsedBits;
      for (version = minVersion; ; version++) {
        var _dataCapacityBits = QrCode2.getNumDataCodewords(version, oriEcl) * 8;
        var usedBits = QrSegment.getTotalBits(segs, version);
        if (usedBits <= _dataCapacityBits) {
          dataUsedBits = usedBits;
          break;
        }
        if (version >= maxVersion) {
          throw new RangeError("Data too long");
        }
      }
      var ecl = oriEcl;
      for (var _i10 = 0, _arr = [Ecc.MEDIUM, Ecc.QUARTILE, Ecc.HIGH]; _i10 < _arr.length; _i10++) {
        var newEcl = _arr[_i10];
        if (boostEcl && dataUsedBits <= QrCode2.getNumDataCodewords(version, newEcl) * 8) {
          ecl = newEcl;
        }
      }
      var bb = [];
      var _iterator4 = _createForOfIteratorHelper(segs), _step4;
      try {
        for (_iterator4.s(); !(_step4 = _iterator4.n()).done; ) {
          var seg = _step4.value;
          appendBits(seg.mode.modeBits, 4, bb);
          appendBits(seg.numChars, seg.mode.numCharCountBits(version), bb);
          var _iterator5 = _createForOfIteratorHelper(seg.getData()), _step5;
          try {
            for (_iterator5.s(); !(_step5 = _iterator5.n()).done; ) {
              var b = _step5.value;
              bb.push(b);
            }
          } catch (err) {
            _iterator5.e(err);
          } finally {
            _iterator5.f();
          }
        }
      } catch (err) {
        _iterator4.e(err);
      } finally {
        _iterator4.f();
      }
      assert(bb.length == dataUsedBits);
      var dataCapacityBits = QrCode2.getNumDataCodewords(version, ecl) * 8;
      assert(bb.length <= dataCapacityBits);
      appendBits(0, Math.min(4, dataCapacityBits - bb.length), bb);
      appendBits(0, (8 - bb.length % 8) % 8, bb);
      assert(bb.length % 8 == 0);
      for (var padByte = 236; bb.length < dataCapacityBits; padByte ^= 236 ^ 17) {
        appendBits(padByte, 8, bb);
      }
      var dataCodewords = [];
      while (dataCodewords.length * 8 < bb.length) {
        dataCodewords.push(0);
      }
      bb.forEach(function(b2, i) {
        dataCodewords[i >>> 3] |= b2 << 7 - (i & 7);
      });
      return new QrCode2(version, ecl, dataCodewords, mask);
    }
  }, {
    key: "getNumRawDataModules",
    value: function getNumRawDataModules(ver) {
      if (ver < QrCode2.MIN_VERSION || ver > QrCode2.MAX_VERSION) {
        throw new RangeError("Version number out of range");
      }
      var result = (16 * ver + 128) * ver + 64;
      if (ver >= 2) {
        var numAlign = Math.floor(ver / 7) + 2;
        result -= (25 * numAlign - 10) * numAlign - 55;
        if (ver >= 7) {
          result -= 36;
        }
      }
      assert(208 <= result && result <= 29648);
      return result;
    }
    // Returns the number of 8-bit data (i.e. not error correction) codewords contained in any
    // QR Code of the given version number and error correction level, with remainder bits discarded.
    // This stateless pure function could be implemented as a (40*4)-cell lookup table.
  }, {
    key: "getNumDataCodewords",
    value: function getNumDataCodewords(ver, ecl) {
      return Math.floor(QrCode2.getNumRawDataModules(ver) / 8) - QrCode2.ECC_CODEWORDS_PER_BLOCK[ecl.ordinal][ver] * QrCode2.NUM_ERROR_CORRECTION_BLOCKS[ecl.ordinal][ver];
    }
    // Returns a Reed-Solomon ECC generator polynomial for the given degree. This could be
    // implemented as a lookup table over all possible parameter values, instead of as an algorithm.
  }, {
    key: "reedSolomonComputeDivisor",
    value: function reedSolomonComputeDivisor(degree) {
      if (degree < 1 || degree > 255) {
        throw new RangeError("Degree out of range");
      }
      var result = [];
      for (var i = 0; i < degree - 1; i++) {
        result.push(0);
      }
      result.push(1);
      var root = 1;
      for (var _i11 = 0; _i11 < degree; _i11++) {
        for (var j = 0; j < result.length; j++) {
          result[j] = QrCode2.reedSolomonMultiply(result[j], root);
          if (j + 1 < result.length) {
            result[j] ^= result[j + 1];
          }
        }
        root = QrCode2.reedSolomonMultiply(root, 2);
      }
      return result;
    }
    // Returns the Reed-Solomon error correction codeword for the given data and divisor polynomials.
  }, {
    key: "reedSolomonComputeRemainder",
    value: function reedSolomonComputeRemainder(data, divisor) {
      var result = divisor.map(function() {
        return 0;
      });
      var _iterator6 = _createForOfIteratorHelper(data), _step6;
      try {
        var _loop2 = function _loop22() {
          var b = _step6.value;
          var factor = b ^ result.shift();
          result.push(0);
          divisor.forEach(function(coef, i) {
            result[i] ^= QrCode2.reedSolomonMultiply(coef, factor);
          });
        };
        for (_iterator6.s(); !(_step6 = _iterator6.n()).done; ) {
          _loop2();
        }
      } catch (err) {
        _iterator6.e(err);
      } finally {
        _iterator6.f();
      }
      return result;
    }
    // Returns the product of the two given field elements modulo GF(2^8/0x11D). The arguments and result
    // are unsigned 8-bit numberegers. This could be implemented as a lookup table of 256*256 entries of unumber8.
  }, {
    key: "reedSolomonMultiply",
    value: function reedSolomonMultiply(x, y) {
      if (x >>> 8 != 0 || y >>> 8 != 0) {
        throw new RangeError("Byte out of range");
      }
      var z = 0;
      for (var i = 7; i >= 0; i--) {
        z = z << 1 ^ (z >>> 7) * 285;
        z ^= (y >>> i & 1) * x;
      }
      assert(z >>> 8 == 0);
      return z;
    }
  }]);
  return QrCode2;
})();
_defineProperty(QrCode, "MIN_VERSION", 1);
_defineProperty(QrCode, "MAX_VERSION", 40);
_defineProperty(QrCode, "PENALTY_N1", 3);
_defineProperty(QrCode, "PENALTY_N2", 3);
_defineProperty(QrCode, "PENALTY_N3", 40);
_defineProperty(QrCode, "PENALTY_N4", 10);
_defineProperty(QrCode, "ECC_CODEWORDS_PER_BLOCK", [
  // Version: (note that index 0 is for padding, and is set to an illegal value)
  //0,  1,  2,  3,  4,  5,  6,  7,  8,  9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40    Error correction level
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  // Low
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  // Medium
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  // Quartile
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]
  // High
]);
_defineProperty(QrCode, "NUM_ERROR_CORRECTION_BLOCKS", [
  // Version: (note that index 0 is for padding, and is set to an illegal value)
  //0, 1, 2, 3, 4, 5, 6, 7, 8, 9,10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40    Error correction level
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  // Low
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  // Medium
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  // Quartile
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]
  // High
]);
export {
  Ecc,
  Mode,
  QrCode,
  QrSegment
};
