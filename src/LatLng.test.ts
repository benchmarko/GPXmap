import LatLng from './LatLng';


describe('LatLng', () => {

    describe("LatLng static methods", () => {
        it("Properties", () => {
            const iDeg = 90;
            const iRad = iDeg * Math.PI / 180;

            expect(LatLng.toRadians(iDeg)).toBe(iRad);
            expect(LatLng.toDegrees(iRad)).toBe(iDeg);
        });
    });


    describe("LatLng Properties", () => {
        it("Properties", () => {
            const oPos = new LatLng();
            const iLat = 49.26883;
            const iLng = 8.67422;
            const sComment = "comment1";
            const sError = "error1";
            const sFormat = "dms";

            oPos.setLatLng(iLat, iLng);
            expect(oPos.getLat()).toBe(iLat);
            expect(oPos.getLng()).toBe(iLng);

            oPos.setComment(sComment);
            expect(oPos.getComment()).toBe(sComment);

            oPos.setError(sError);
            expect(oPos.getError()).toBe(sError);

            oPos.setFormat(sFormat);
            expect(oPos.getFormat()).toBe(sFormat);

            expect(String(oPos)).toBe("49.26883,8.67422,comment1,dms,error1");
        });

        it("Clone", () => {
            const oPos1 = new LatLng().setLatLng(49, 8).setComment("c1").setFormat("dmsc");

            oPos1.setError("e1");
            expect(String(oPos1)).toBe("49,8,c1,dmsc,e1");

            const oPos2 = oPos1.clone();
            expect(String(oPos2)).toBe("49,8,c1,dmsc,e1");

            oPos2.setLatLng(49.2, 8.2).setComment("c2").setFormat("ddc");
            oPos2.setError("e2");
            expect(String(oPos2)).toBe("49.2,8.2,c2,ddc,e2");

            expect(String(oPos1)).toBe("49,8,c1,dmsc,e1");
        });
    });

    interface TestEntryType1 {
        testMsg?: string,
        lat?: number,
        lng?: number,
        comment?: string,
        format?: string
    };

    describe("LatLng Parse, Format", () => {
        it("Parse format dmm, dmmc", () => {
            const mInput: Record<string, TestEntryType1> = {
                "N 49° 16.130 E 008° 40.453": {
                    testMsg: "normal"
                },
                "N 49 16.130 E 008 40.453": {
                    testMsg: "no degree symbols"
                },
                "N 49 16.13 E 8 40.453": {
                    testMsg: "no leading or tailing zeros"
                },
                "N49°16.130E008°40.453": {
                    testMsg: "no spaces"
                },
                "N49 16.130E008 40.453": {
                    testMsg: "no spaces except for missing degree symbols"
                },
                "  N  49 °  16.130  E  008  ° 40.453  ": {
                    testMsg: "additional spaces"
                },
                "S 49° 16.130 W 008° 40.453": {
                    testMsg: "normal, SW",
                    lat: -49.26883333333333,
                    lng: -8.674216666666666
                },
                "N 49° 16.130 E 008° 40.453!comment1": {
                    testMsg: "normal, with comment",
                    comment: "comment1",
                    format: "dmmc"
                }
            };
            const oResultTemplate = {
                lat: 49.26883333333333,
                lng: 8.674216666666666,
                format: "dmm"
            };

            for (const sInput of Object.keys(mInput)) {
                const oResult = { ...oResultTemplate, ...mInput[sInput] };
                delete oResult.testMsg;
                const oPos = new LatLng().parse(sInput);
                expect(oPos).toEqual(oResult);
            }
        });

        it("Parse format dms, dmsc", () => {
            const mInput: Record<string, TestEntryType1> = {
                "N 49° 16' 07.80\" E 008° 40' 27.18\"": {
                    testMsg: "normal"
                },
                "N 49 16' 07.80\" E 008 40' 27.18\"": {
                    testMsg: "no degree symbols"
                },
                "N 49° 16' 07.8\" E 8° 40' 27.18\"": {
                    testMsg: "no leading or tailing zeros"
                },
                "N49°16'07.80\"E008°40'27.18\"": {
                    testMsg: "no spaces"
                },
                "N49 16'07.80\"E008 40'27.18\"": {
                    testMsg: "no spaces except for missing degree symbols"
                },
                "  N 49 ° 16 ' 07.80 \"  E  008 ° 40  '  27.18  \"  ": {
                    testMsg: "additional spaces"
                },
                "S 49° 16' 07.80\" W 008° 40' 27.18\"": {
                    testMsg: "normal, SW",
                    lat: -49.26883333333333,
                    lng: -8.674216666666666
                },
                "N 49° 16' 07.80\" E 008° 40' 27.18\"!comment1": {
                    testMsg: "normal, with comment",
                    comment: "comment1",
                    format: "dmsc"
                }
            };
            const oResultTemplate = {
                lat: 49.26883333333333,
                lng: 8.674216666666666,
                format: "dms"
            };

            for (const sInput of Object.keys(mInput)) {
                const oResult = { ...oResultTemplate, ...mInput[sInput] };
                delete oResult.testMsg;
                const oPos = new LatLng().parse(sInput);
                expect(oPos).toEqual(oResult);
            }
        });

        it("Parse format dd, ddc", () => {
            const mInput: Record<string, TestEntryType1> = {
                "N 49.26883° E 008.67422°": {
                    testMsg: "normal"
                },
                "N 49.26883 E 008.67422": {
                    testMsg: "no degree symbols"
                },
                "N 49.26883° E 8.67422°": {
                    testMsg: "no leading or tailing zeros"
                },
                "N49.26883°E008.67422°": {
                    testMsg: "no spaces"
                },
                "N49.26883 E008.67422": {
                    testMsg: "no spaces except for missing degree symbols"
                },
                "  N 49.26883  ° E  008.67422 °  ": {
                    testMsg: "additional spaces"
                },
                "S 49.26883° W 008.67422°": {
                    testMsg: "normal, SW",
                    lat: -49.26883,
                    lng: -8.67422
                },
                "N 49.26883° E 008.67422°!comment1": {
                    testMsg: "normal, with comment",
                    comment: "comment1",
                    format: "ddc"
                }
            };
            const oResultTemplate = {
                lat: 49.26883,
                lng: 8.67422,
                format: "dd"
            };

            for (const sInput of Object.keys(mInput)) {
                const oResult = { ...oResultTemplate, ...mInput[sInput] };
                delete oResult.testMsg;
                const oPos = new LatLng().parse(sInput);
                expect(oPos).toEqual(oResult);
            }
        });

        it("Parse: error", () => {
            const oResult: { lat: number, lng: number, error?: string } = {
                lat: 0,
                lng: 0,
                error: "Cannot parse °"
            };

            //const bSuppressWarnings = true;

            let sInput = "°";
            let oPos = new LatLng().parse(sInput); //, bSuppressWarnings
            expect(oPos).toEqual(oResult);

            sInput = "";
            delete oResult.error;
            oPos = oPos.parse(sInput); //, bSuppressWarnings
            expect(oPos).toEqual(oResult);
        });

        interface TestEntryType2 {
            format: string,
            lat?: number,
            lng?: number,
            comment?: string,
        };

        it("toFormattedString: format like input format", () => {
            const mTest: Record<string, TestEntryType2> = {
                "N 49° 16.130 E 008° 40.453": {
                    format: "dmm"
                },
                "N 49° 16' 07.80\" E 008° 40' 27.18\"": {
                    format: "dms"
                },
                "N 49.26883° E 008.67422°": {
                    format: "dd"
                },
                "N 49° 16.130 E 008° 40.453!comment1": {
                    format: "dmmc",
                    comment: "comment1"
                },
                "N 49° 16' 07.80\" E 008° 40' 27.18\"!comment2": {
                    format: "dmsc",
                    comment: "comment2"
                },
                "N 49.26883° E 008.67422°!comment3": {
                    format: "ddc",
                    comment: "comment3"
                },
                "S 49° 16.130 W 008° 40.453": {
                    format: "dmm",
                    lat: -49.26883333333333,
                    lng: -8.674216666666666
                }
            };
            const oInputTemplate = {
                lat: 49.26883333333333,
                lng: 8.674216666666666
            };

            for (const sTest of Object.keys(mTest)) {
                const oPos = { ...oInputTemplate, ...mTest[sTest] };
                const oLatLng = new LatLng(oPos.lat, oPos.lng).setFormat(oPos.format).setComment(oPos.comment || "");
                const sPos = oLatLng.toFormattedString();
                expect(sPos).toBe(sTest);
            }
        });

        interface TestEntryType3 {
            testFormat?: string,
            lat?: number,
            lng?: number,
            comment?: string,
        };

        it("toFormattedString: override input format", () => {
            const mTest: Record<string, TestEntryType3> = {
                "N 49° 16.130 E 008° 40.453": {
                    testFormat: "dmm"
                },
                "N 49° 16' 07.80\" E 008° 40' 27.18\"": {
                    testFormat: "dms"
                },
                "N 49.26883° E 008.67422°": {
                    testFormat: "dd"
                },
                "N 49° 16.130 E 008° 40.453!comment1": {
                    comment: "comment1",
                    testFormat: "dmmc"
                },
                "N 49° 16' 07.80\" E 008° 40' 27.18\"!comment2": {
                    comment: "comment2",
                    testFormat: "dmsc"
                },
                "N 49.26883° E 008.67422°!comment3": {
                    comment: "comment3",
                    testFormat: "ddc"
                },
                "S 49° 16.130 W 008° 40.453": {
                    testFormat: "dmm",
                    lat: -49.26883333333333,
                    lng: -8.674216666666666
                },
                "S 49° 16' 07.80\" W 008° 40' 27.18\"": {
                    testFormat: "dms",
                    lat: -49.26883333333333,
                    lng: -8.674216666666666
                },
                "S 49.26883° W 008.67422°": {
                    testFormat: "dd",
                    lat: -49.26883333333333,
                    lng: -8.674216666666666
                }
            };
            const oInputTemplate = {
                lat: 49.26883333333333,
                lng: 8.674216666666666,
                format: "dms"
            };

            for (const sTest of Object.keys(mTest)) {
                const oPos = { ...oInputTemplate, ...mTest[sTest] };
                delete oPos.testFormat;
                const oLatLng = new LatLng(oPos.lat, oPos.lng).setFormat(oPos.format).setComment(oPos.comment || "");
                const sPos = oLatLng.toFormattedString(mTest[sTest].testFormat);
                expect(sPos).toBe(sTest);
            }

        });

        it("toFormattedString: error", () => {
            //const bSuppressWarnings = true;
            const oPos = {
                lat: 49.26883333333333,
                lng: 8.674216666666666
            };
            const sTest = ""; // unknown format

            let oLatLng = new LatLng(oPos.lat, oPos.lng);
            let sPos = oLatLng.toFormattedString("x1"); //bSuppressWarnings
            expect(sPos).toBe(sTest);

            oLatLng.setFormat("x2");
            sPos = oLatLng.toFormattedString(""); //bSuppressWarnings)
            expect(sPos).toBe(sTest);
        });
    });


    describe("LatLng Geodesy Tools", () => {
        function getTestData1() {
            const data = {
                aPos: [
                    new LatLng(49.26883, 8.67422).toFixed(9), // w0="N 49.26883° E 008.67422°", "N 49° 16.130 E 008° 40.453"
                    new LatLng(49.26505, 8.67962).toFixed(9), // w1="N 49.26505° E 008.67962°", "N 49° 15.903 E 008° 40.777"
                    new LatLng(49.26970, 8.68050).toFixed(9), // w2="N 49.26970° E 008.68050°", "N 49° 16.182 E 008° 40.830"

                    new LatLng(49.266940031, 8.676920103).toFixed(9), // wm0="N 49.26694 E 008.67692", "N 49° 16.017 E 008° 40.615"
                    new LatLng(49.269265043, 8.677359972).toFixed(9), // wm1
                    new LatLng(49.267375001, 8.680059979).toFixed(9) // wm2
                ],
                dist: {
                    dist01: 574.6186779117294,
                    dist02: 465.8032626741822,
                    dist12: 520.983961384917
                },
                bear: {
                    bear01: 137.00779818179797,
                    bear10: 317.01189007469907,
                    bear02: 78.01099496559812,
                    bear20: 258.01575385181184,
                    bear12: 7.039455969586186,
                    bear21: 187.04012280093679
                }
            };

            return data;
        }

        it("distanceTo", () => {
            const data = getTestData1();
            const w = data.aPos;
            const dist = data.dist;

            expect(w[0].distanceTo(w[0])).toBe(0);

            expect(w[0].distanceTo(w[1]).toFixed(11)).toBe(dist.dist01.toFixed(11)); // toFixed needed for IE
            expect(w[1].distanceTo(w[0]).toFixed(11)).toBe(dist.dist01.toFixed(11));

            expect(w[0].distanceTo(w[2])).toBe(dist.dist02);
            expect(w[2].distanceTo(w[0])).toBe(dist.dist02);

            expect(w[1].distanceTo(w[2])).toBe(dist.dist12);
            expect(w[2].distanceTo(w[1])).toBe(dist.dist12);
        });

        it("bearingTo", () => {
            const data = getTestData1();
            const w = data.aPos;
            const bear = data.bear;

            expect(w[0].bearingTo(w[0])).toBe(0);

            expect(w[0].bearingTo(w[1]).toFixed(9)).toBe(bear.bear01.toFixed(9)); // toFixed needed for IE
            expect(w[1].bearingTo(w[0]).toFixed(9)).toBe(bear.bear10.toFixed(9));

            expect(w[0].bearingTo(w[2]).toFixed(9)).toBe(bear.bear02.toFixed(9));
            expect(w[2].bearingTo(w[0]).toFixed(9)).toBe(bear.bear20.toFixed(9));

            expect(w[1].bearingTo(w[2])).toBe(bear.bear12);
            expect(w[2].bearingTo(w[1])).toBe(bear.bear21);
        });

        it("destinationPoint (projection)", () => {
            const data = getTestData1();
            const w = data.aPos;
            const dist = data.dist;
            const bear = data.bear;

            expect(w[0].destinationPoint(0, 0).toFixed(9)).toEqual(w[0]);

            expect(w[0].destinationPoint(dist.dist01, bear.bear01).toFixed(9)).toEqual(w[1]);
            expect(w[1].destinationPoint(dist.dist01, bear.bear10).toFixed(9)).toEqual(w[0]);

            expect(w[0].destinationPoint(dist.dist02, bear.bear02).toFixed(9)).toEqual(w[2]);
            expect(w[2].destinationPoint(dist.dist02, bear.bear20).toFixed(9)).toEqual(w[0]);

            expect(w[1].destinationPoint(dist.dist12, bear.bear12).toFixed(9)).toEqual(w[2]);
            expect(w[2].destinationPoint(dist.dist12, bear.bear21).toFixed(9)).toEqual(w[1]);

            expect(w[0].destinationPoint(dist.dist01 / 2, bear.bear01).toFixed(9)).toEqual(w[3]);
        });

        it("intersection", () => {
            const data = getTestData1();
            const w = data.aPos;
            const bear = data.bear;

            expect(LatLng.prototype.intersection(w[0], bear.bear02, w[1], bear.bear12).toFixed(9)).toEqual(w[2]);
            expect(LatLng.prototype.intersection(w[0], bear.bear01, w[2], bear.bear21).toFixed(9)).toEqual(w[1]);
            expect(LatLng.prototype.intersection(w[1], bear.bear10, w[2], bear.bear20).toFixed(9)).toEqual(w[0]);
        });

        it("intersection error", () => {
            //const bSuppressWarnings = true;
            const data = getTestData1();
            const w = data.aPos;

            // bSuppressWarnings
            expect(LatLng.prototype.intersection(w[0], 0, w[0], 0).getError()).toBe("intersection distance=0");
            expect(LatLng.prototype.intersection(w[0], 180, w[3], 0).getError()).toBe("ambiguous intersection");
        });

    });
});