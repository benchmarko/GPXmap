// ScriptParser.ts - Parse calculation scripts

import LatLng from "./LatLng";

type Token = {
	type: string;
	value: string;
	pos: number;
};

type ParseNode = Token & {
	//type: string;
	//value?: string | number | ParseNode;
	left?: ParseNode;
	right?: ParseNode;
	args?: ParseNode[];
	name?: string;
	//pos?: number;
};

type ParseFunction = (node: ParseNode) => ParseNode;

interface SymbolType {
	nud?: ParseFunction // null denotative function
	lbp?: number // left binding power
	led?: ParseFunction // left denotative function
	//std?: ParseFunction // statement function
}

type Variables = Record<string, string | number>;
type Functions = Record<string, (...args: any[]) => any>;

const toRadians = (deg: number) => deg * Math.PI / 180;
const toDegrees = (rad: number) => rad * 180 / Math.PI;

const regExpEscape = (s: string) => {
	return s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"); // (github.com/benjamingr/RegExp.escape), one / removed
};

export default class ScriptParser {
	options: { ignoreFuncCase?: boolean; ignoreVarCase?: boolean };

	constructor(options?: { ignoreFuncCase?: boolean; ignoreVarCase?: boolean }) {
		this.options = options || {};
	}

	static ErrorObject = class extends Error {
		value: string;
		pos: number;
		constructor(message: string, value: string, pos: number) {
			super(`${message}: ${value} (pos: ${pos})`);
			this.value = value;
			this.pos = pos;
			this.name = "ScriptParserError";
			//this.toString = () => `Error: ${this.message}: ${this.value} (pos: ${this.pos})`; 
		}
	};

	lex(input: string): Token[] {
		const isComment = (c: string) => /[#]/.test(c);
		const isOperator = (c: string) => /[+\-*/^%=()[\],]/.test(c);
		const isDigit = (c: string) => /[0-9]/.test(c);
		const isWhiteSpace = (c: string) => /\s/.test(c);
		const isQuotes = (c: string) => /["]/.test(c);
		const isNotQuotes = (c: string) => c !== "" && !isQuotes(c);
		const isApostrophe = (c: string) => /[']/.test(c);
		const isNotApostrophe = (c: string) => c !== "" && !isApostrophe(c);
		const isIdentifier = (c: string) => c !== "" && /[$\w]/.test(c);
		const isFormatter = (c: string) => /[:]/.test(c);
		const isNotFormatter = (c: string) => c !== "" && /[0#.]/.test(c);
		const isNotNewLine = (c: string) => c !== "" && c !== "\n";

		const aTokens: Token[] = [];
		let sToken: string;
		let sChar: string;
		let iStartPos: number;
		let iIndex = 0;

		const advance = () => {
			iIndex += 1;
			return input.charAt(iIndex);
		};
		const advanceWhile = (fn: (c: string) => boolean) => {
			let sToken2 = "";
			do {
				sToken2 += sChar;
				sChar = advance();
			} while (fn(sChar));
			return sToken2;
		};
		const advanceWhileEscape = (fn: (c: string) => boolean) => {
			let sToken2 = "";
			do {
				if (sChar === "\\") {
					sChar = advance();
					if (sChar === "n") {
						sChar = "\n";
					}
				}
				sToken2 += sChar;
				sChar = advance();
			} while (fn(sChar));
			return sToken2;
		};
		const addToken = (type: string, value: any, iPos: number) => {
			aTokens.push({ type, value, pos: iPos });
		};

		while (iIndex < input.length) {
			iStartPos = iIndex;
			sChar = input.charAt(iIndex);
			if (isWhiteSpace(sChar)) {
				sChar = advance();
			} else if (isComment(sChar)) {
				advanceWhile(isNotNewLine);
			} else if (isOperator(sChar)) {
				addToken(sChar, 0, iStartPos);
				sChar = advance();
			} else if (isDigit(sChar)) {
				sToken = advanceWhile(isDigit);
				if (sChar === ".") {
					sToken += advanceWhile(isDigit);
				}
				const numToken = parseFloat(sToken);
				if (!isFinite(numToken)) {
					throw new ScriptParser.ErrorObject("Number is too large or too small", sToken, iStartPos);
				}
				addToken("number", sToken, iStartPos);
			} else if (isQuotes(sChar)) {
				sChar = "";
				sToken = advanceWhileEscape(isNotQuotes);
				addToken("string", sToken, iStartPos + 1);
				if (!isQuotes(sChar)) {
					throw new ScriptParser.ErrorObject("Unterminated string", sToken, iStartPos + 1);
				}
				sChar = advance();
			} else if (isApostrophe(sChar)) {
				sChar = "";
				sToken = advanceWhile(isNotApostrophe);
				addToken("string", sToken, iStartPos + 1);
				if (!isApostrophe(sChar)) {
					throw new ScriptParser.ErrorObject("Unterminated string", sToken, iStartPos + 1);
				}
				sChar = advance();
			} else if (isIdentifier(sChar)) {
				sToken = advanceWhile(isIdentifier);
				addToken("identifier", sToken, iStartPos);
			} else if (isFormatter(sChar)) {
				sChar = "";
				sToken = advanceWhile(isNotFormatter);
				addToken("formatter", sToken, iStartPos);
				if (!isFormatter(sChar)) {
					throw new ScriptParser.ErrorObject("Unterminated formatter", sToken, iStartPos + 1);
				}
				sChar = advance();
			} else {
				throw new ScriptParser.ErrorObject("Unrecognized token", sChar, iStartPos);
			}
		}
		addToken("(end)", 0, iIndex);
		return aTokens;
	}

	parse(tokens: Token[]): ParseNode[] {
		const symbols: Record<string, SymbolType> = {};
		let index = 0;
		const parseTree: ParseNode[] = [];

		const fnNode = (node: ParseNode) => node;

		const symbol = (id: string, nud?: ParseFunction, lbp?: number, led?: ParseFunction) => {
			let sym = symbols[id];
			if (!sym) {
				symbols[id] = {};
				sym = symbols[id];
			}
			if (nud) {
				sym.nud = nud;
			}
			if (lbp) {
				sym.lbp = lbp;
			}
			if (led) {
				sym.led = led;
			}
		};

		const interpretToken = (t: Token): ParseNode => {
			if (!t) {
				// return null;
				throw new ScriptParser.ErrorObject("No token", "", 0);
			}
			const parseToken = t as ParseNode; // we get a lex token and reuse it as parseTree token
			/*
			const oSym = Object.create(oSymbols[oToken.type]);
			oSym.type = oToken.type;
			oSym.value = oToken.value;
			oSym.pos = oToken.pos;
			return oSym;
			*/
			return parseToken;
		};

		const token = () => interpretToken(tokens[index]);

		const advance = () => {
			index += 1;
			return token();
		};

		const expression = (rbp: number): ParseNode => {
			let t = token();
			let s = symbols[t.type];

			// if (Utils.debug > 3) {
			//     Utils.console.debug("parse: expression rbp=" + rbp + " type=" + t.type + " t=%o", t);
			// }
			advance();
			if (!s.nud) {
				if (t.type === "(end)") {
					throw new ScriptParser.ErrorObject("Unexpected end of file", "", t.pos);
				} else {
					throw new ScriptParser.ErrorObject("Unexpected token", t.type, t.pos);
				}
			}
			let left = s.nud(t);

			t = token();
			s = symbols[t.type];
			while (rbp < (s.lbp || 0)) {
				t = token();
				advance();
				if (!s.led) {
					throw new ScriptParser.ErrorObject("Unexpected token", t.type, tokens[index].pos);
				}
				left = s.led(left);
				t = token();
				s = symbols[t.type];
			}
			return left;
		};

		const infix = (id: string, lbp: number, rbp?: number, led?: ParseFunction) => {
			rbp = rbp || lbp;
			symbol(id, undefined, lbp, led || function (left: ParseNode) {
				return {
					type: id,
					left: left,
					right: expression(rbp!)
					//value: "",
					//pos: 0
				} as ParseNode;
			});
		};
		const prefix = (id: string, rbp: number) => {
			symbol(id, () => {
				return {
					type: id,
					right: expression(rbp)
					//value: "",
					//pos: 0
				} as ParseNode;
			});
		};

		symbol(",");
		symbol(")");
		symbol("]");
		symbol("(end)");

		symbol("number", fnNode);
		symbol("string", fnNode);
		symbol("identifier", (node: ParseNode) => {
			if (token().type === "(") {
				const parseIndex = index;
				const args: ParseNode[] = [];
				if (tokens[index + 1].type === ")") {
					advance();
				} else {
					do {
						advance();
						args.push(expression(2));
					} while (token().type === ",");
					if (token().type !== ")") {
						throw new ScriptParser.ErrorObject("Expected closing parenthesis for function", String(tokens[parseIndex - 1].value), tokens[parseIndex].pos);
					}
				}
				advance();
				return {
					type: "call",
					args: args,
					name: node.value,
					value: "",
					pos: tokens[parseIndex - 1].pos
				};
			}
			return node;
		});

		symbol("(", () => {
			const parseIndex = index;
			const value = expression(2);
			if (token().type !== ")") {
				throw new ScriptParser.ErrorObject("Expected closing parenthesis", ")", tokens[parseIndex].pos);
			}
			advance();
			return value;
		});

		symbol("[", function () {
			let t = token();
			let node: ParseNode;
			if (t.type === "(end)") {
				throw new ScriptParser.ErrorObject("Unexpected end of file", "", t.pos);
			}
			if (tokens[index + 1].type === "]") {
				node = expression(2);
			} else {
				const parseIndex = index;
				const args: ParseNode[] = [];
				do {
					args.push(expression(2));
					t = token();
				} while (t.type !== "]" && t.type !== "(end)");
				if (t.type !== "]") {
					throw new ScriptParser.ErrorObject("Expected closing bracket", "]", tokens[parseIndex].pos);
				}
				node = {
					type: "call",
					args: args,
					name: "concat",
					value: "",
					pos: tokens[parseIndex - 1].pos
				};
			}
			advance();
			return node;
		});

		symbol("formatter", undefined, 3, (left: ParseNode) => {
			const t = tokens[index - 1]; // formatter token
			return {
				type: "formatter",
				value: t.value,
				left: left,
				pos: t.pos
			};
		});

		prefix("-", 8);
		infix("^", 7, 6);
		infix("*", 5);
		infix("/", 5);
		infix("%", 5);
		infix("+", 4);
		infix("-", 4);

		infix("=", 1, 2, (left: ParseNode) => {
			let node: ParseNode;
			if (left.type === "identifier") {
				node = {
					type: "assign",
					name: left.value,
					value: "",
					right: expression(0), // //TTT value: expression(2),
					pos: left.pos
				};
			} else {
				node = tokens[index - 1];
				throw new ScriptParser.ErrorObject("Invalid lvalue at", node.type, node.pos);
			}
			return node;
		});

		while (token().type !== "(end)") {
			parseTree.push(expression(0));
		}
		return parseTree;
	}

	evaluate(parseTree: ParseNode[], variables: Variables, functions: Functions): string {
		const that = this;
		const operators: Record<string, any> = {
			"+": (a: any, b: any) => Number(a) + Number(b),
			"-": (a: any, b?: any) => (b === undefined ? -a : a - b),
			"*": (a: number, b: number) => a * b,
			"/": (a: number, b: number) => a / b,
			"%": (a: any, b: any) => a % b,
			"^": (a: any, b: any) => Math.pow(a, b)
		};
		const mFunctions = functions;

		const checkArgs = (name: string, aArgs: any[], iPos: number) => {
			const oFunction = mFunctions[name];

			if (oFunction.length !== aArgs.length) {
				const optionalArgs = mFunctions[`${name}_optionalArgs`]?.();
				if (optionalArgs) {
					if (optionalArgs === Number.POSITIVE_INFINITY) { // varargs (needed for concat)?
						return;
					}
					const iMin = oFunction.length - Number(optionalArgs); // optionalArgs (instr)
					if (aArgs.length >= iMin && aArgs.length <= oFunction.length) {
						return;
					}
				}
				throw new ScriptParser.ErrorObject("Wrong number of arguments for function", name, iPos);
			}
		};

		const fnAdaptFunctionName = (sName: string) =>
			that.options.ignoreFuncCase ? sName.toLowerCase() : sName;

		const fnAdaptVariableName = (sName: string) =>
			that.options.ignoreVarCase ? sName.toLowerCase() : sName;

		const parseNode = (node: ParseNode): string | number | null => {
			let value: string | number | null;
			let sName: string;
			if (node.type === "string") {
				value = node.value as string;
			} else if (node.type === "number") {
				value = parseFloat(node.value as string);
			} else if (operators[node.type]) {
				if (node.left) {
					value = operators[node.type](parseNode(node.left), parseNode(node.right!));
				} else {
					value = operators[node.type](parseNode(node.right!));
				}
			} else if (node.type === "identifier") {
				sName = fnAdaptVariableName(node.value as string);
				value = variables[sName];
				if (value === undefined) {
					throw new ScriptParser.ErrorObject("Variable is undefined", String(node.value), node.pos);
				}
			} else if (node.type === "assign") {
				value = parseNode(node.right!); //value = parseNode(node.value!);
				sName = fnAdaptVariableName(node.name!);
				if (value === null) {
					throw new ScriptParser.ErrorObject("value is null", sName, node.pos); // should not occure
				}
				variables[sName] = value;
				if (String(parseFloat(String(value))) !== String(value)) { //TTT tocheck!
					value = '"' + value + '"';
				}
				value = node.name + "=" + value;
			} else if (node.type === "call") {
				const aNodeArgs = [];
				for (let i = 0; i < node.args!.length; i += 1) {
					aNodeArgs[i] = parseNode(node.args![i]);
				}
				sName = fnAdaptFunctionName(node.name!);
				if (mFunctions[sName] === undefined) {
					throw new ScriptParser.ErrorObject("Function is undefined", sName, node.pos);
				}
				checkArgs(sName, aNodeArgs, node.pos!);
				value = mFunctions[sName].apply(node, aNodeArgs);
			/*
			} else if (node.type === "function") {
				sName = fnAdaptFunctionName(node.name!);
				mFunctions[sName] = function (...args: any[]) {
					const oArgs: Variables = {};
					for (let i = 0; i < node.args!.length; i += 1) {
						oArgs[node.args![i].value as string] = args[i];
					}
					aFunctionScope.push(oArgs);
					value = parseNode(node.value! as ParseNode);
					aFunctionScope.pop();
					return value;
				};
			*/
			} else if (node.type === "formatter") {
				value = parseNode(node.left!);
				value = mFunctions.numFormat(value, node.value);
			} else {
				console.error("parseNode node=%o unknown type=" + node.type, node);
				value = String(node);
			}
			return value;
		};

		const output: string[] = [];
		for (let i = 0; i < parseTree.length; i += 1) {
			// if (Utils.debug > 2) {
			//     Utils.console.debug("evaluate: parseTree i=%d, node=%o", i, parseTree[i]);
			// }
			const result = parseNode(parseTree[i]);
			if (result === null) { // cls
				output.length = 0;
			} else if (result !== "") {
				output.push(String(result));
			}
		}
		return output.join("\n");
	}

	calculate(input: string, variables: Variables): string {
		const that = this;
		const mFunctions = {
			// concat(s1, s2, ...) concatenate strings (called by operator [..] ); varargs
			concat_optionalArgs: () => Number.POSITIVE_INFINITY,
			concat: (...args: (string | number)[]) => args.join(""),

			// needed for formatter
			numFormat: (s: string, format: string) => {
				if (format.indexOf(".") < 0) {
					s = Number(s).toFixed(0);
					s = mFunctions.zFormat(s, format.length);
				} else { // assume 000.00
					const aFormat = format.split(".", 2);
					s = Number(s).toFixed(aFormat[1].length);
					s = mFunctions.zFormat(s, format.length);
				}
				return s;
			},

			// needed for sval
			zFormat: (s: string, length: number) => {
				s = String(s);
				for (let i = s.length; i < length; i += 1) {
					s = "0" + s;
				}
				return s;
			},

			//

			abs: Math.abs,

			acos: (x: number): number => toDegrees(Math.acos(x)),

			asin: (x: number): number => toDegrees(Math.asin(x)),

			atan: (x: number): number => toDegrees(Math.atan(x)),

			// bearing(w1, w2) bearing between w1 and w2 in degrees
			bearing: function (w1: string, w2: string) {
				const pos1 = new LatLng().parse(w1);
				const pos2 = new LatLng().parse(w2);

				return pos1.bearingTo(pos2);
			},

			// cb(w1, angle1, w2, angle2) crossbearing
			cb: function (w1: string, angle1: number, w2: string, angle2: number) {
				const pos1 = new LatLng().parse(w1);
				const pos2 = new LatLng().parse(w2);

				const pos3 = LatLng.prototype.intersection(pos1, angle1, pos2, angle2);
				const err = pos3.getError();
				let sValue = pos3.toFormattedString();
				if (err) {
					sValue += "!error!" + err;
				}
				return sValue;
			},

			// center, zentrum
			center: () => {
				console.log("center() ignored.");
			},

			cls: () => null, // clear output trigger

			cos: (deg: number): number => Math.cos(toRadians(deg)),

			// count(s, s2) count individual characters from s2 in string s
			count: function (s: string, s2: string) {
				let sOut = "";

				s = String(s);
				s2 = String(s2);
				if (s2.length === 1) {
					return mFunctions.countStr(s, s2);
				}
				const aSearch = s2.split("");
				for (let i = 0; i < aSearch.length; i += 1) {
					const sStr = aSearch[i];
					sOut += " " + sStr + "=" + mFunctions.countStr(s, sStr);
				}
				return sOut.trim();
				// CacheWolf appends a space, we don't do that.
			},

			// countStr(s, c) Count number of occurrences of substring s2 in s //TTT
			// https://stackoverflow.com/questions/881085/count-the-number-of-occurrences-of-a-character-in-a-string-in-javascript
			countStr: function (s: string, s2: string) {
				return (String(s).match(new RegExp(s2, "g")) || []).length;
			},

			// cp, curpos TTT ??

			// ct (crosstotal)
			ct: function (x: number) {
				const sStr = String(x).replace(/[^\d]/g, "");
				let iSum = 0;


				for (let i = 0; i < sStr.length; i += 1) {
					iSum += Number(sStr.charAt(i));
				}
				return iSum;
			},

			d2r: (deg: number) => toRadians(deg),

			// deg() switch do degrees mode (default, ignored, we always use degrees)
			deg: () => {
				console.log("deg() ignored."); //TTT
			},

			// distance(w1, w2) distance between w1 and w2 in meters
			distance: function (w1: string, w2: string) {
				const oPosition1 = new LatLng().parse(w1);
				const oPosition2 = new LatLng().parse(w2);

				const nValue = oPosition1.distanceTo(oPosition2);
				return nValue;
			},

			// encode(s, m1, m2) encode s with character mapping m1 to m2
			// example rot13: sourceMap="NOPQRSTUVWXYZABCDEFGHIJKLMnopqrstuvwxyzabcdefghijklm" destinatonMap="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
			// https://stackoverflow.com/questions/617647/where-is-my-one-line-implementation-of-rot13-in-javascript-going-wrong
			encode: function (s: string, sourceMap: string, destinatonMap: string) {
				const rSearch = new RegExp("[" + sourceMap + "]", "g");

				return s.replace(rSearch, function (c) {
					return destinatonMap.charAt(
						sourceMap.indexOf(c)
					);
				});
			},

			// format(w1, fmt): format waypoint w1 with format "", "dmm", "dms", "dd", "dmmc", "dmsc", "ddc"
			format: function (w1: string, format: string) {
				const oPosition = new LatLng().parse(w1);

				const sValue = oPosition.toFormattedString(format);
				if (!sValue) {
					throw new ScriptParser.ErrorObject("Unknown format", format, -1);
				}
				return sValue;
			},

			goto: () => {
				console.log("goto ignored."); //TTT
			},

			// ic(n) Ignore variable andd function case
			ic_optionalArgs: () => 1, // optional args 1: mode
			ic: function (mode?: string) {
				if (typeof mode === "undefined") { // no parameter, return status
					return Boolean(that.options.ignoreVarCase);
				}
				that.options.ignoreVarCase = Boolean(mode);
				return "";
			},

			// instr (indexOf with positions starting with 1), 'start' is optional
			instr_optionalArgs: () => 1,
			instr: function (s: string, search: string, start?: number) { // optional args 1: start
				return String(s).indexOf(search, start ? start - 1 : 0) + 1;
			},

			int: Math.trunc,

			// lc, toLowerCase
			lc: (s: string) => String(s).toLowerCase(),

			len: (s: string) => String(s).length,

			// mid(s, index, len) substr with positions starting with 1
			mid: function (s: string, start: number, length: number) {
				return String(s).substr(start - 1, length);
			},

			// mod: or should it be... https://stackoverflow.com/questions/4467539/javascript-modulo-not-behaving
			mod: function (a: number, b: number) { return a % b; },

			// pc, pz, profilecenter, profilezentrum
			pc: () => {
				console.warn("pc ignored.");
			},

			// project(w1, bearing, distance) project from w1 bearing degrees and distance meters
			project: function (w1: string, bearing: number, distance: number) {
				const pos1 = new LatLng().parse(w1);
				const pos2 = pos1.destinationPoint(distance, bearing); // order of arguments!
				return pos2.toFormattedString();
			},

			// r2d, rad2deg
			r2d: (rad: number) => toDegrees(rad),

			// rad() switch do radians mode (not supported, we always use degrees)
			rad: () => {
				console.warn("rad ignored.");
			},

			// replace(s, s1, r1): replace all occurrences of s1 in s by r1
			replace: function (s: string, search: string, replace: string) {
				const escaped = regExpEscape(search);
				const pattern = new RegExp(escaped, "g");
				return String(s).replace(pattern, replace);
			},

			reverse: function (s: string) {
				return String(s).split("").reverse().join("");
			},

			rot13: function (s: string) {
				return String(s).replace(/[A-Za-z]/g, function (c) {
					return String.fromCharCode(c.charCodeAt(0) + (c.toUpperCase() <= "M" ? 13 : -13));
				});
			},

			show: () => {
				console.warn("show ignored.");
			},

			sin: (deg: number): number => Math.sin(toRadians(deg)),

			skeleton: () => {
				console.warn("skeleton ignored.");
			},

			sqrt: Math.sqrt,

			// sval (separate value) for A-Z, a-z: 01 02 03 ...
			sval: function (s: string) {
				const iCodeBeforeA = "a".charCodeAt(0) - 1;
				let sOut = "";

				s = String(s).toLowerCase().replace(/[^a-z]/g, "");
				for (let i = 0; i < s.length; i += 1) {
					sOut += ((i > 0) ? " " : "") + mFunctions.zFormat(s.charCodeAt(i) - iCodeBeforeA, 2);
				}
				return sOut;
			},

			tan: (deg: number): number => Math.tan(toRadians(deg)),

			// uc, touppercase, ucase
			uc: (s: string) => String(s).toUpperCase(),

			// val (value) for A-Z, a-z: 1-26
			val: function (s: string) {
				const iCodeBeforeA = "a".charCodeAt(0) - 1;
				let iSum = 0;

				s = String(s).toLowerCase();
				for (let i = 0; i < s.length; i += 1) {
					let iNumber = s.charCodeAt(i) - iCodeBeforeA;
					if ((iNumber < 0) || (iNumber > 26)) {
						iNumber = 0;
					}
					iSum += iNumber;
				}
				return iSum;
			},

			// Not in Wolf Language:
			//log: Math.log,
			//exp: Math.exp,
			//max: Math.max,
			//min: Math.min,
			//random: Math.random,
			// gcd: greatest common divisor of a and b (Euclid)
			// fib: xth Fibonacci number
			// midpoint: Same as: project(w1, bearing(w1, w2), distance(w1, w2) / 2)
			// cti (crosstotal iterated)
			// vstr (value(s) to string, optional iShift) (new)
			// isequal a === b
			// getconst; PI, E
			// parse(s)
			// assert(a, b)
		} as Functions;

		const tokens = this.lex(input);
		const parseTree = this.parse(tokens);
		const output = this.evaluate(parseTree, variables, mFunctions);
		return output;
	}
}
