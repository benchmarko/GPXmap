interface Utils {
    strNumFormat(s: string | number, iLen: number, sFillChar: string | null): string;
    strZeroFormat(s: string | number, iLen: number): string;
}

const Utils: Utils = {
    strNumFormat(s: string | number, iLen: number, sFillChar: string | null = " "): string {
        let str = String(s);
        for (let i = str.length; i < iLen; i += 1) {
            str = sFillChar + str;
        }
        return str;
    },
    strZeroFormat(s: string | number, iLen: number): string {
        return Utils.strNumFormat(s, iLen, "0");
    }
};

export default class LatLng {
    private lat: number;
    private lng: number;
    private comment?: string;
    private format?: string;
    private error?: string;

    constructor(lat?: number | string, lng?: number | string) {
        this.lat = 0;
        this.lng = 0;
        if (lat !== undefined && lng !== undefined) {
            this.init(lat, lng);
        }
    }

    private init(lat: number | string, lng: number | string): void {
        this.setLatLng(lat, lng);
    }

    static toRadians(deg: number): number {
        return deg * Math.PI / 180;
    }

    static toDegrees(rad: number): number {
        return rad * 180 / Math.PI;
    }

    clone(): LatLng {
        const clone = new LatLng(
            this.lat,
            this.lng
        );
        if (this.comment !== undefined) {
            clone.setComment(this.comment);
        }
        if (this.error !== undefined) {
            clone.setError(this.error);
        }
        if (this.format !== undefined) {
            clone.setFormat(this.format);
        }
        //Object.assign(clone, this);
        return clone;
    }

    public getLat(): number {
        return this.lat;
    }

    public getLng(): number {
        return this.lng;
    }

    setLatLng(lat: number | string, lng: number | string): this {
        this.lat = Number(lat);
        this.lng = Number(lng);
        return this;
    }

    getComment(): string {
        return this.comment ?? "";
    }

    setComment(comment: string): this {
        this.comment = comment;
        return this;
    }

    getFormat(): string | undefined {
        return this.format;
    }

    setFormat(format: string): this {
        this.format = format;
        return this;
    }

    getError(): string | undefined {
        return this.error;
    }

    setError(error: string): this {
        this.error = error;
        return this;
    }

    toString(): string {
        return [this.lat, this.lng, this.comment, this.format, this.error].join(",");
    }

    distanceTo(point: LatLng): number {
        const radius = 6371e3;
        const phi1 = LatLng.toRadians(this.lat);
        const lambda1 = LatLng.toRadians(this.lng);
        const phi2 = LatLng.toRadians(point.lat);
        const lambda2 = LatLng.toRadians(point.lng);
        const deltaPhi = phi2 - phi1;
        const deltaLambda = lambda2 - lambda1;

        const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return radius * c;
    }

    bearingTo(point: LatLng): number {
        const phi1 = LatLng.toRadians(this.lat);
        const phi2 = LatLng.toRadians(point.lat);
        const deltaLambda = LatLng.toRadians(point.lng - this.lng);

        const y = Math.sin(deltaLambda) * Math.cos(phi2);
        const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
        const theta = Math.atan2(y, x);

        return (LatLng.toDegrees(theta) + 360) % 360;
    }

    destinationPoint(distance: number, bearing: number): LatLng {
        const radius = 6371000;
        const delta = Number(distance) / radius;
        const theta = LatLng.toRadians(Number(bearing));

        const phi1 = LatLng.toRadians(this.lat);
        const lambda1 = LatLng.toRadians(this.lng);

        const sinPhi1 = Math.sin(phi1);
        const cosPhi1 = Math.cos(phi1);
        const sinDelta = Math.sin(delta);
        const cosDelta = Math.cos(delta);
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);

        const sinPhi2 = sinPhi1 * cosDelta + cosPhi1 * sinDelta * cosTheta;
        const phi2 = Math.asin(sinPhi2);
        const y = sinTheta * sinDelta * cosPhi1;
        const x = cosDelta - sinPhi1 * sinPhi2;
        const lambda2 = lambda1 + Math.atan2(y, x);

        return new LatLng(
            LatLng.toDegrees(phi2),
            (LatLng.toDegrees(lambda2) + 540) % 360 - 180
        );
    }

    intersection(p1: LatLng, bearing1: number, p2: LatLng, bearing2: number): LatLng {
        // see http://www.edwilliams.org/avform.htm#Intersection (former: http://williams.best.vwh.net/avform.htm#Intersection)
        const phi1 = LatLng.toRadians(p1.lat);
        const lambda1 = LatLng.toRadians(p1.lng);
        const phi2 = LatLng.toRadians(p2.lat);
        const lambda2 = LatLng.toRadians(p2.lng);
        const theta13 = LatLng.toRadians(Number(bearing1));
        const theta23 = LatLng.toRadians(Number(bearing2));
        const deltaphi = phi2 - phi1;
        const deltalambda = lambda2 - lambda1;

        const delta12 = 2 * Math.asin(Math.sqrt(Math.sin(deltaphi / 2) * Math.sin(deltaphi / 2)
            + Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltalambda / 2) * Math.sin(deltalambda / 2))); // distance

        if (delta12 === 0) {
            return new LatLng(0, 0).setError("intersection distance=0");
        }

        // initial/final bearings between points
        const cosThetaa = (Math.sin(phi2) - Math.sin(phi1) * Math.cos(delta12)) / (Math.sin(delta12) * Math.cos(phi1));
        const cosThetab = (Math.sin(phi1) - Math.sin(phi2) * Math.cos(delta12)) / (Math.sin(delta12) * Math.cos(phi2));
        const thetaa = Math.acos(Math.min(Math.max(cosThetaa, -1), 1)); // protect against rounding errors
        const thetab = Math.acos(Math.min(Math.max(cosThetab, -1), 1)); // protect against rounding errors

        const theta12 = Math.sin(lambda2 - lambda1) > 0 ? thetaa : 2 * Math.PI - thetaa;
        const theta21 = Math.sin(lambda2 - lambda1) > 0 ? 2 * Math.PI - thetab : thetab;

        const alpha1 = (theta13 - theta12 + Math.PI) % (2 * Math.PI) - Math.PI; // angle 2-1-3
        const alpha2 = (theta21 - theta23 + Math.PI) % (2 * Math.PI) - Math.PI; // angle 1-2-3

        if (Math.sin(alpha1) === 0 && Math.sin(alpha2) === 0) {
            return new LatLng(0, 0).setError("infinite intersections");
        }
        if (Math.sin(alpha1) * Math.sin(alpha2) < 0) {
            return new LatLng(0, 0).setError("ambiguous intersection");
        }

        const alpha3 = Math.acos(-Math.cos(alpha1) * Math.cos(alpha2) + Math.sin(alpha1) * Math.sin(alpha2) * Math.cos(delta12));
        const delta13 = Math.atan2(Math.sin(delta12) * Math.sin(alpha1) * Math.sin(alpha2), Math.cos(alpha2) + Math.cos(alpha1) * Math.cos(alpha3));
        const phi3 = Math.asin(Math.sin(phi1) * Math.cos(delta13) + Math.cos(phi1) * Math.sin(delta13) * Math.cos(theta13));
        const deltalambda13 = Math.atan2(Math.sin(theta13) * Math.sin(delta13) * Math.cos(phi1), Math.cos(delta13) - Math.sin(phi1) * Math.sin(phi3));
        const lambda3 = lambda1 + deltalambda13;

        return new LatLng(LatLng.toDegrees(phi3), (LatLng.toDegrees(lambda3) + 540) % 360 - 180); // normalise to −180..+180°
    }

    parse(coord: string): this {
        let lat = 0;
        let lng = 0;
        let sFormat = "";

        function dmm2position() {
            const aParts = coord.match(/^\s*(N|S)\s*(\d+)\s*[° ]\s*(\d+\.\d+)\s*(E|W)\s*(\d+)\s*[° ]\s*(\d+\.\d+)/); // dmm
            if (aParts && aParts.length === 7) {
                lat = parseInt(aParts[2], 10) + parseFloat(aParts[3]) / 60;
                lng = parseInt(aParts[5], 10) + parseFloat(aParts[6]) / 60;
                if (aParts[1] === "S") {
                    lat = -lat;
                }
                if (aParts[4] === "W") {
                    lng = -lng;
                }
                sFormat = "dmm";
                return true;
            }
            return false;
        }

        function dms2position() {
            const aParts = coord.match(/^\s*(N|S)\s*(\d+)\s*[° ]\s*(\d+)\s*'\s*(\d+\.?\d*)\s*"\s*(E|W)\s*(\d+)\s*[° ]\s*(\d+)\s*'\s*(\d+\.?\d*)\s*"/);
            if (aParts && aParts.length === 9) {
                lat = parseInt(aParts[2], 10) + parseFloat(aParts[3]) / 60 + parseFloat(aParts[4]) / 3600;
                lng = parseInt(aParts[6], 10) + parseFloat(aParts[7]) / 60 + parseFloat(aParts[8]) / 3600;
                if (aParts[1] === "S") {
                    lat = -lat;
                }
                if (aParts[5] === "W") {
                    lng = -lng;
                }
                sFormat = "dms";
                return true;
            }
            return false;
        }

        function dd2position() {
            const aParts = coord.match(/^\s*(N|S)\s*(\d+\.\d+)\s*[° ]\s*(E|W)\s*(\d+\.\d+)\s*°?/);
            if (aParts && aParts.length === 5) {
                lat = parseFloat(aParts[2]);
                lng = parseFloat(aParts[4]);
                if (aParts[1] === "S") {
                    lat = -lat;
                }
                if (aParts[3] === "W") {
                    lng = -lng;
                }
                sFormat = "dd";
                return true;
            }
            return false;
        }

        const iCommentIndex = coord.indexOf("!");
        if (iCommentIndex >= 0) {
            this.comment = coord.substr(iCommentIndex + 1);
            coord = coord.substr(0, iCommentIndex);
        } else if (this.comment !== undefined) { // comment was set?
            delete this.comment;
        }

        const bParseOk = dmm2position() || dms2position() || dd2position();
        this.lat = lat;
        this.lng = lng;
        if (sFormat) {
            this.format = sFormat + ((this.comment) ? "c" : "");
        }
        delete this.error;
        if (!bParseOk && coord !== "") {
            this.error = "Cannot parse " + coord;
            console.warn("parse2position: Cannot parse '" + coord + "'");
        }
        return this;
    }

    toFixed(digits: number): this {
        this.lat = Number(Number(this.lat).toFixed(digits));
        this.lng = Number(Number(this.lng).toFixed(digits));
        return this;
    }

    toFormattedString(format?: string): string {
        let sValue: string;
        let sComment;

        function position2dmm(position: LatLng) {
            const lat = Math.abs(position.lat);
            const lng = Math.abs(position.lng);
            const latNS = (position.lat >= 0) ? "N" : "S";
            const lngEW = (position.lng >= 0) ? "E" : "W";
            const latdeg = Math.floor(lat);
            const latmin = (lat - latdeg) * 60;
            const lngdeg = Math.floor(lng);
            const lngmin = (lng - lngdeg) * 60;

            return latNS + " " + Utils.strZeroFormat(latdeg, 2) + "° " + Utils.strZeroFormat(latmin.toFixed(3), 6) + " " + lngEW + " " + Utils.strZeroFormat(lngdeg, 3) + "° " + Utils.strZeroFormat(lngmin.toFixed(3), 6);
        }

        function position2dms(position: LatLng) {
            const lat = Math.abs(position.lat);
            const lng = Math.abs(position.lng);
            const latNS = (position.lat >= 0) ? "N" : "S";
            const lngEW = (position.lng >= 0) ? "E" : "W";
            const latdeg = Math.floor(lat);
            const latmin = Math.floor((lat - latdeg) * 60);
            const latsec = Math.round((lat - latdeg - latmin / 60) * 1000 * 3600) / 1000;
            const lngdeg = Math.floor(lng);
            const lngmin = Math.floor((lng - lngdeg) * 60);
            const lngsec = Math.floor((lng - lngdeg - lngmin / 60) * 1000 * 3600) / 1000;

            return latNS + " " + Utils.strZeroFormat(latdeg, 2) + "° " + Utils.strZeroFormat(latmin, 2) + "' " + Utils.strZeroFormat(latsec.toFixed(2), 5) + "\" "
                + lngEW + " " + Utils.strZeroFormat(lngdeg, 3) + "° " + Utils.strZeroFormat(lngmin, 2) + "' " + Utils.strZeroFormat(lngsec.toFixed(2), 5) + "\"";
        }

        function position2dd(position: LatLng) {
            let lat = position.lat;
            let lng = position.lng;
            const latNS = (lat >= 0) ? "N" : "S";
            const lngEW = (lng >= 0) ? "E" : "W";

            if (latNS === "S") {
                lat = -lat;
            }
            if (lngEW === "W") {
                lng = -lng;
            }
            const sDD = latNS + " " + Utils.strZeroFormat(lat.toFixed(5), 8) + "° " + lngEW + " " + Utils.strZeroFormat(lng.toFixed(5), 9) + "°";
            return sDD;
        }

        format = format || this.format || "dmm";
        if (format.charAt(format.length - 1) === "c") {
            format = format.substr(0, format.length - 1);
            sComment = this.getComment();
        }
        switch (format) {
            case "dmm":
                sValue = position2dmm(this);
                break;
            case "dms":
                sValue = position2dms(this);
                break;
            case "dd":
                sValue = position2dd(this);
                break;
            default:
                sValue = "";
                console.warn("position2string: Unknown format: " + format);
        }
        if (sComment) {
            sValue += "!" + sComment;
        }
        return sValue;
    }
}