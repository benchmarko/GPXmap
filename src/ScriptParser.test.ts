import ScriptParser, { type ValueType, type ValueTypeWithNull, type VariableAccessType } from './ScriptParser';

function getVariableAccess(vars = {}) {
    const variableAccess: VariableAccessType = {
        vars,
        get: (name: string) => variableAccess.vars[name],
        set: (name: string, value: ReturnType<VariableAccessType["get"]>) => {
            variableAccess.vars[name] = value;
        }
    };
    return variableAccess;
}

describe('ScriptParser', () => {
    let parser: ScriptParser;

    beforeEach(() => {
        parser = new ScriptParser();
    });

    describe('lex', () => {
        it('should tokenize numbers', () => {
            const tokens = parser.lex('42 3.14');
            expect(tokens).toEqual([
                { type: 'number', value: "42", pos: 0 },
                { type: 'number', value: "3.14", pos: 3 },
                { type: '(end)', value: "", pos: 7 }
            ]);
        });

        it('should tokenize strings with double quotes', () => {
            const tokens = parser.lex('"hello"');
            expect(tokens).toEqual([
                { type: 'string', value: 'hello', pos: 1 },
                { type: '(end)', value: "", pos: 7 }
            ]);
        });

        it('should tokenize strings with single quotes', () => {
            const tokens = parser.lex("'world'");
            expect(tokens).toEqual([
                { type: 'string', value: 'world', pos: 1 },
                { type: '(end)', value: "", pos: 7 }
            ]);
        });

        it('should tokenize operators', () => {
            const tokens = parser.lex('1 + 2 * 3');
            expect(tokens).toEqual([
                { type: 'number', value: "1", pos: 0 },
                { type: '+', value: "", pos: 2 },
                { type: 'number', value: "2", pos: 4 },
                { type: '*', value: "", pos: 6 },
                { type: 'number', value: "3", pos: 8 },
                { type: '(end)', value: "", pos: 9 }
            ]);
        });

        it('should handle comments', () => {
            const tokens = parser.lex('42 # this is a comment\n43');
            expect(tokens).toEqual([
                { type: 'number', value: "42", pos: 0 },
                { type: 'number', value: "43", pos: 23 },
                { type: '(end)', value: "", pos: 25 }
            ]);
        });

        it('should throw error for unterminated string', () => {
            expect(() => parser.lex('"unterminated')).toThrow(ScriptParser.ErrorObject);
            expect(() => parser.lex('"unterminated')).toThrow('Unterminated string');
        });
    });

    describe('parse', () => {
        it('should parse simple arithmetic expressions', () => {
            const tokens = parser.lex('1 + 2 * 3');
            const tree = parser.parse(tokens);
            expect(tree).toHaveLength(1);
            expect(tree[0]).toEqual({
                type: '+',
                left: { type: 'number', value: "1", pos: 0 },
                right: {
                    type: '*',
                    left: { type: 'number', value: "2", pos: 4 },
                    right: { type: 'number', value: "3", pos: 8 }
                }
            });
        });

        it('should parse function calls', () => {
            const tokens = parser.lex('sin(45)');
            const tree = parser.parse(tokens);
            expect(tree).toHaveLength(1);
            expect(tree[0]).toEqual({
                type: 'sin',
                name: '',
                args: [{ type: 'number', value: "45", pos: 4 }],
                pos: 0,
                value: ""
            });
        });

        it('should parse variable assignments', () => {
            const tokens = parser.lex('x = 42');
            const tree = parser.parse(tokens);
            expect(tree).toHaveLength(1);
            expect(tree[0]).toEqual({
                type: 'assign',
                name: 'x',
                right: { type: 'number', value: "42", pos: 4 },
                value: "",
                pos: 0
            });
        });
    });

    describe('evaluate', () => {
        const variableAccess: VariableAccessType = {
            vars: {},
            get: (name: string) => variableAccess.vars[name],
            set: (name: string, value: ValueType) => {
                variableAccess.vars[name] = value;
            }
        };
        it('should evaluate arithmetic expressions', () => {
            const tokens = parser.lex('1 + 2 * 3');
            const tree = parser.parse(tokens);
            const result = parser.evaluate(tree, variableAccess, {});
            expect(result).toBe("7");
        });

        it('should evaluate function calls', () => {
            const tokens = parser.lex('abs(-5)');
            const tree = parser.parse(tokens);
            const result = parser.evaluate(tree, variableAccess, {
                abs: (x: ValueTypeWithNull) => Math.abs(Number(x))
            });
            expect(result).toBe("5");
        });

        it('should handle variable assignments', () => {
            const tokens = parser.lex('x = 42');
            const tree = parser.parse(tokens);
            const result = parser.evaluate(tree, variableAccess, {});
            expect(result).toBe('x=42');
            expect(variableAccess.get('x')).toBe(42);
        });
    });

    describe('calculate', () => {

        describe('basic calculation tests', () => {
            const variableAccess = getVariableAccess({ x: 10, y: 20 });

            it('should calculate arithmetic expressions', () => {
                const result = parser.calculate('x + y * 2', variableAccess);
                expect(result).toEqual("50");
            });

            it('should handle built-in functions', () => {
                const result = parser.calculate('sin(90)', variableAccess);
                expect(parseFloat(result)).toBeCloseTo(1, 5);
            });

            it('should handle errors', () => {
                expect(() => {
                    parser.calculate('undefined_func()', variableAccess)
                    //}).toThrow('Function is undefined: undefined_func (pos: 0)');
                }).toThrow('Unexpected token (nud): ) (pos: 15)');
            });

            it('should support string operations', () => {
                const result = parser.calculate('_concat("Hello", " ", "World")', variableAccess);
                expect(result).toEqual('Hello World');
            });

            it('should handle variable case sensitivity', () => {
                const parser = new ScriptParser({ ignoreVarCase: true });
                const vars = { abc: 42 };
                const icVariableAccess = getVariableAccess(vars);
                const result = parser.calculate('ABC', icVariableAccess);
                expect(result).toEqual("42");
            });
        });

        describe('built-in functions', () => {
            const variableAccess = getVariableAccess();

            it('should calculate cross total', () => {
                const result = parser.calculate('ct(123)', variableAccess);
                expect(result).toEqual("6");
            });

            it('should count character occurrences', () => {
                const result = parser.calculate('count("hello", "l")', variableAccess);
                expect(result).toEqual("2");
            });

            it('should perform string value calculations', () => {
                const result = parser.calculate('val("ABC")', variableAccess);
                expect(result).toEqual("6"); // A=1, B=2, C=3
            });

            it('should format numbers', () => {
                const result = parser.calculate('3.14:000.00:', variableAccess);
                expect(result).toEqual('003.14');
            });
        });

        describe('geographic functions', () => {
            const variableAccess = getVariableAccess();

            it('should calculate bearing between coordinates', () => {
                const result = parser.calculate('bearing("N 45 00.000 E 010 00.000", "N 46 00.000 E 010 00.000")', variableAccess);
                expect(result).toBeDefined();
                const bearing = parseFloat(result);
                expect(bearing).toBeGreaterThanOrEqual(0);
                expect(bearing).toBeLessThanOrEqual(360);
            });

            it('should calculate distance between coordinates', () => {
                const result = parser.calculate('distance("N 45 00.000 E 010 00.000", "N 46 00.000 E 010 00.000")', variableAccess);
                expect(result).toBeDefined();
                const distance = parseFloat(result);
                expect(distance).toBeGreaterThan(0);
            });

            it('should project coordinates', () => {
                const result = parser.calculate('project("N 45 00.000 E 010 00.000", 90, 10000)', variableAccess);
                expect(result).toBeDefined();
                expect(result).toMatch(/N \d+/);
                expect(result).toMatch(/E \d+/);
            });

        });

        describe('if statements', () => {
            let variableAccess: VariableAccessType;

            beforeEach(() => {
                variableAccess = getVariableAccess({ x: 10 });
            });

            it('should execute commands when condition is true', () => {
                const result = parser.calculate('if 1 then x = 20 endif', variableAccess);
                expect(result).toBe('x=20');
                expect(variableAccess.get('x')).toBe(20);
            });

            it('should not execute commands when condition is false', () => {
                const result = parser.calculate('if 0 then x = 20 endif', variableAccess);
                expect(result).toBe('');
                expect(variableAccess.get('x')).toBe(10); // x remains unchanged
            });

            it('should support multiple commands in if block', () => {
                const result = parser.calculate('if 1 then x = 20; x = x + 5 endif', variableAccess);
                expect(result).toBe('x=20\nx=25');
                expect(variableAccess.get('x')).toBe(25);
            });

            it('should support = comparison in if conditions', () => {
                const result = parser.calculate('if x = 10 then x = 20 endif', variableAccess);
                expect(result).toBe('x=20');
                expect(variableAccess.get('x')).toBe(20);
            });

            it('should support <> comparison in if conditions', () => {
                const result = parser.calculate('if x <> 30 then x = 30 endif', variableAccess);
                expect(result).toBe('x=30');
                expect(variableAccess.get('x')).toBe(30);
            });

            it('should support < comparison in if conditions', () => {
                const result = parser.calculate('if x < 20 then x = 40 endif', variableAccess);
                expect(result).toBe('x=40');
                expect(variableAccess.get('x')).toBe(40);
            });

            it('should support > comparison in if conditions', () => {
                const result = parser.calculate('if x > 0 then x = 50 endif', variableAccess);
                expect(result).toBe('x=50');
                expect(variableAccess.get('x')).toBe(50);
            });

            it('should support <= comparison in if conditions', () => {
                const result = parser.calculate('if x <= 10 then x = 60 endif', variableAccess);
                expect(result).toBe('x=60');
                expect(variableAccess.get('x')).toBe(60);
            });

            it('should support >= comparison in if conditions', () => {
                const result = parser.calculate('if x >= 10 then x = 70 endif', variableAccess);
                expect(result).toBe('x=70');
                expect(variableAccess.get('x')).toBe(70);
            });

            it('should throw error when missing then', () => {
                expect(() => {
                    parser.calculate('if 1 x = 20 endif', variableAccess);
                }).toThrow('Expected THEN');
            });

            it('should throw error when missing endif', () => {
                expect(() => {
                    parser.calculate('if 1 then x = 20', variableAccess);
                }).toThrow('Expected ENDIF');
            });
        });

        describe('calculation tests', () => {

            const calculationTests = {
                5: "5", // Number
                '"5"': "5", // String

                "5+3.14": "8.14", // Number+Number=Number
                '"5"+3.14': "8.14", // String+Number=Number
                '"5"+"3.14"': "8.14", // #String+String=Number

                "[5]": "5",
                '["5" "3.14"]': "53.14", // String String=String
                '["5" 3.14]': "53.14", // String Number=String
                "[5 3.14]": "53.14", // Number Number=String
                '[3.14 "15" 92 65]': "3.14159265",

                "_concat()": "",
                "_concat(5)": "5",
                '_concat("5", "3.14")': "53.14", // String String=String
                '_concat("5", 3.14)': "53.14", // String Number=String
                "_concat(5, 3.14)": "53.14", // Number Number=String
                '_concat(3.14, "15", 92, 65)': "3.14159265",

                "abs(3.14)": "3.14",
                "abs(-3.14)": "3.14",

                "int(3.14)": "3",
                "int(3.54)": "3",
                "int(-3.14)": "-3",
                "int(-3.54)": "-3",

                "mod(25,7)": "4",
                "mod(-13,64)": "-13",

                "sqrt(9)": "3",

                "ct(1234567890)": "45",
                'ct("1234567890")': "45",
                'ct("R9z876gh5432%.*^/+-10")': "45",

                'ct(ct("1234567890"))': "9",

                'val("a")': "1",
                'val("Z")': "26",
                'val("abcdefghijklmnopqrstuvw xyz")': "351",
                'val("äöüß")': "0",
                "val(1234567)": "0",
                'val("1234567")': "0",

                'sval("ABCDEFGZz")': "01 02 03 04 05 06 07 26 26",
                'sval("ABCabcxyzxyZäöü")': "01 02 03 01 02 03 24 25 26 24 25 26",

                'encode("ABBA17abba","AB7","OS2")': "OSSO12abba",
                'val(encode(lc("ÄÖüß"),"äöüß","{|}~"))': "0",

                'instr("abc","a")': "1",
                'instr("abc","d")': "0",
                'instr("abcABCabc","ab")': "1",
                'instr("abcABCabc","BC")': "5",
                'instr("abcABCabc","ab", 3)': "7", // optional start index

                'len("")': "0",
                'len("abcABCabc")': "9",
                "len(5)": "1",

                'count("str1,str2,str3,str4",",")': "3",
                'count("str1,str2,str3,st","str")': "s=4 t=4 r=3",

                // Comparison operators (currently all are string comparisons)

                "5 < 60": "true",
                "15 < 10": "false",
                "5 > 60": "false",
                "15 > 10": "true",
                "10 <= 10": "true",
                "5 <= 60": "true",
                "15 <= 10": "false",
                "10 >= 10": "true",
                "15 >= 10": "true",
                "5 >= 60": "false",
                "5 <> 10": "true",
                "10 <> 10": "false",
                '"abc" < "def"': "true",
                '"def" < "abc"': "false",
                '"abc" <> "def"': "true",
                '"abc" <> "abc"': "false",

                'mid("abcABCabc",3,5)': "cABCa",
                'mid("abcABCabc",3)': "cABCabc",

                'uc("abcäöüABC")': "ABCÄÖÜABC",

                'lc("ABCÄÖÜßabc")': "abcäöüßabc",

                'replace("abcABCabc","bc","Xy")': "aXyABCaXy",

                'reverse("abcZ")': "Zcba",

                'rot13("abcdefghijklmnopqrstuvexyzABC")': "nopqrstuvwxyzabcdefghirklmNOP",

                "0:000:": "000",
                "8.2:000.0:": "008.2",
                "8.2:000.000:": "008.200",

                "ic()": "false",
                "ic(0)": "",
                "ic(1)": "",
                "ic(1) ic()": "true",

                "10^309": "Infinity",
                "10^310": String(Math.pow(10, 309)) // both Infinity
            };

            it('should handle all calculation cases correctly', () => {
                const parser = new ScriptParser();

                Object.entries(calculationTests).forEach(([input, expected]) => {
                    try {
                        const variableAccess = getVariableAccess();
                        const result = parser.calculate(input, variableAccess);
                        expect(result).toBe(expected);
                    } catch (e) {
                        //const errorMessage = error instanceof ScriptParser.ErrorObject ? error.message : String(error);
                        const errorMessage = String(e);
                        throw new Error(`Test failed for input: "${input}"\nExpected: "${expected}"\nReceived: "${errorMessage}"`);
                    }
                });
            });

            // Add specific test for Infinity cases
            it('should handle Infinity cases correctly', () => {
                const parser = new ScriptParser();
                const infinityTests = {
                    "10^309": "Infinity",
                    "10^310": "Infinity"
                };

                Object.entries(infinityTests).forEach(([input, expected]) => {
                    const variableAccess = getVariableAccess();
                    const result = parser.calculate(input, variableAccess);
                    //expect(parseFloat(result)).toBe(expected);
                    expect(result).toBe(expected);
                });
            });
        });

        describe('trigonometry tests', () => {

            const trigonometryTests = {
                "d2r(1)*180": String(Math.PI),
                "1/r2d(1)*180": String(Math.PI),
                "r2d(d2r(90))": "90",
                "int(d2r(90)*10000+0.5)/10000": "1.5708",

                "sin(90)": "1",
                "sin(60)": String(Math.sqrt(3) / 2),
                "int(sin(30)*10000+0.5)/10000": String(1 / 2),
                "int(sin(45)*10000+0.5)/10000": String(Math.floor(1 / Math.sqrt(2) * 10000 + 0.5) / 10000),
                "sin(r2d(d2r(90)))": "1",

                "cos(0)": "1",
                "int(cos(45)*10000+0.5)/10000": String(Math.floor(1 / Math.sqrt(2) * 10000 + 0.5) / 10000),
                "int(cos(60)*10000+0.5)/10000": String(1 / 2),

                "int(tan(30)*10000+0.5)/10000": String(Math.floor(1 / Math.sqrt(3) * 10000 + 0.5) / 10000),
                "int(tan(45)*10000+0.5)/10000": "1",
                "int(tan(60)*10000+0.5)/10000": String(Math.floor(Math.sqrt(3) * 10000 + 0.5) / 10000),

                "int(asin(sin(45))*10000+0.5)/10000": "45",
                "sin(asin(d2r(45)))": String(45 * Math.PI / 180),

                "acos(cos(45))": "45",
                "int(cos(acos(d2r(45)))*10000+0.5)/10000": String(Math.floor(45 * Math.PI / 180 * 10000 + 0.5) / 10000),

                "atan(1)": "45",
                "int(atan(tan(45))*10000+0.5)/10000": "45"
            };

            it('should handle all trigonometry cases correctly', () => {
                const parser = new ScriptParser();

                Object.entries(trigonometryTests).forEach(([input, expected]) => {
                    try {
                        const variableAccess = getVariableAccess();
                        const result = parser.calculate(input, variableAccess);
                        expect(result).toBe(expected);
                    } catch (e) {
                        //const errorMessage = error instanceof ScriptParser.ErrorObject ? error.message : String(error);
                        const errorMessage = String(e);
                        throw new Error(`Test failed for input: "${input}"\nExpected: "${expected}"\nReceived: "${errorMessage}"`);
                    }
                });
            });
        });
        describe('waypoint calculation tests', () => {

            const $W0 = "N 49° 16.130 E 008° 40.453";
            const $W0C = $W0 + "!category0!title0";
            const $W1 = "N 49° 15.903 E 008° 40.777";
            const $W2 = "N 49° 16.182 E 008° 40.830";
            const $WM1 = "N 49° 16.017 E 008° 40.615";
            const $WM2 = "N 49° 16' 02.58\" E 008° 40' 48.18\"";
            const $WM3 = "N 49.26927° E 008.67735°";

            const waypointCalculationTests = {
                "int(bearing($W0,$W1))": "137",
                "int(bearing($W1,$W0))": "317",
                "int(bearing($W0,$W2))": "78",
                "int(bearing($W2,$W0))": "258",
                "int(bearing($W1,$W2))": "7",
                "int(bearing($W2,$W1))": "187",

                "cb($W0,78,$W1,7)": $W2,
                "cb($W0,137,$W2,187)": $W1,
                "cb($W1,317,$W2,258)": $W0,

                "distance($W0,$W0)": "0",
                "int(distance($W0,$W1)+0.5)": "575",
                "int(distance($W1,$W0)+0.5)": "575",
                "int(distance($W0,$W2)+0.5)": "466",
                "int(distance($W1,$W2))": "521",

                "project($W0,137,575)": $W1,
                "project($W0,78,466)": $W2,
                "project($W1,317,575)": $W0,
                "project($W1,7,521)": $W2,

                "project($W0,bearing($W0,$W1),distance($W0,$W1)/2)": $WM1,

                'format($W0,"dmm")': $W0,
                'format($W0,"dms")': "N 49° 16' 07.80\" E 008° 40' 27.18\"",
                'format($W0,"dd")': "N 49.26883° E 008.67422°",
                'format("N49°16.130E008°40.453","dmm")': $W0,
                'format("N 49.26883 E 8.67422","dmm")': $W0, // convert dd to dmm
                'format($WM2,"dmm")': "N 49° 16.043 E 008° 40.803",
                'format($WM2,"dd")': "N 49.26738° E 008.68005°",
                "project($W1,bearing($W1,$WM2)+0.1,distance($W1,$WM2)*1.994)": $W2, // (with fragile corrections)

                'format($WM3,"dmm")': "N 49° 16.156 E 008° 40.641",
                'format($WM3,"dms")': "N 49° 16' 09.37\" E 008° 40' 38.46\"",

                'format($W0C,"dmmc")': $W0C, // waypoint with comment and title
                'format($W0C,"dmm")': $W0,
                'format($W0C,"ddc")': "N 49.26883° E 008.67422°!category0!title0",

                '$WP="N 49° 16.130 E 008° 40.453"': "$WP=\"N 49° 16.130 E 008° 40.453\""
            };

            it('should handle all waypoint calculation cases correctly', () => {
                const parser = new ScriptParser();

                Object.entries(waypointCalculationTests).forEach(([input, expected]) => {
                    try {
                        const vars = {
                            $W0,
                            $W0C,
                            $W1,
                            $W2,
                            $WM1,
                            $WM2,
                            $WM3
                        };
                        const variableAccess = getVariableAccess(vars);
                        const result = parser.calculate(input, variableAccess);
                        expect(result).toBe(expected);
                    } catch (e) {
                        //const errorMessage = error instanceof ScriptParser.ErrorObject ? error.message : String(error);
                        const errorMessage = String(e);
                        throw new Error(`Test failed for input: "${input}"\nExpected: "${expected}"\nReceived: "${errorMessage}"`);
                    }
                });
            });

        });

    });
});
