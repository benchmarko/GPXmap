// ZipFile.ts - ZIP file handling
// (c) Marco Vieth, 2019
//
// Idea based on: https://github.com/frash23/jzsip/blob/master/jzsip.js (and Cpcemu: zip.cpp)
// https://pkwaredownloads.blob.core.windows.net/pkware-general/Documentation/APPNOTE-6.3.9.TXT
//

import { ZipCrypto } from "./ZipCrypto";

export interface ZipFileOptions {
    data: Uint8Array
}

type CodeType = {
    count: number[],
    symbol: number[]
};

interface CentralDirFileHeader {
    readonly signature: number
    readonly version: number // version needed to extract (minimum)
    readonly flag: number // General purpose bit flag
        // bit 0: encrypted; bit 6: strong encryption; bit 13: central directory encrypted
    readonly compressionMethod: number // compression method
    readonly modificationTime: number // File last modification time (DOS time)
    readonly crc: number // CRC-32 of uncompressed data
    readonly compressedSize: number // compressed size
    readonly size: number // Uncompressed size
    readonly fileNameLength: number // file name length
    readonly extraFieldLength: number // extra field length
    readonly fileCommentLength: number // file comment length
    readonly localOffset: number // relative offset of local file header
    name: string
    isDirectory: boolean
    extra: Uint8Array
    comment: string
    timestamp: number
    dataStart: number
}

export type ZipDirectoryType = Record<string, CentralDirFileHeader>

interface EndOfCentralDir {
    readonly signature: number
    readonly entries: number // total number of central directory records
    readonly cdfhOffset: number // offset of start of central directory, relative to start of archive
    readonly cdSize: number // size of central directory (just for information)
}

const ZipConstants = {
    eocdSignature: 0x06054B50, // EOCD signature: "PK\x05\x06"
    cdfhSignature: 0x02014B50, // Central directory file header signature: PK\x01\x02"
    lfhSignature: 0x04034B50, // Local file header signature: "PK\x03\x04"
    eocdLen: 22, // End of central directory (EOCD)
    cdfhLen: 46, // Central directory file header length
    lfhLen: 30 // Local file header length
};

function textDecoderDecodePolyfill(data: Uint8Array): string {
    const callSize = 25000; // use call window to avoid "maximum call stack error" for e.g. size 336461
    let out = "";
    let len = data.length;
    let offset = 0;

    while (len > 0) {
        const chunkLen = Math.min(len, callSize);
        const nums = data.subarray(offset, offset + chunkLen);

        out += String.fromCharCode.apply(null, nums as unknown as number[]); // on Chrome this is faster than single character processing
        offset += chunkLen;
        len -= chunkLen;
    }
    return out;
}

export class ZipFile {
    private readonly options: ZipFileOptions;

    private data!: Uint8Array;
    private entryTable: ZipDirectoryType = {};
    private static textDecoder = typeof TextDecoder !== "undefined" ? new TextDecoder("utf-8", { fatal: false }) : { decode: textDecoderDecodePolyfill };

    constructor(options: ZipFileOptions) {
        this.options = {} as ZipFileOptions;
        this.setOptions(options, true);
    }

    // Get current options
    // Note: The data option is returned as is (no copy)
    public getOptions(): ZipFileOptions {
        return this.options;
    }

    // Set options
    // If force is true, the ZIP directory is re-read even if the data option has not changed
    // Note: The data option is used as is (no copy)
    public setOptions(options: Partial<ZipFileOptions>, force: boolean): void {
        const currentData = this.options.data;

        Object.assign(this.options, options);
        if (force || (this.options.data !== currentData)) {
            this.data = this.options.data;
            this.entryTable = this.readZipDirectory();
        }
    }

    // Get the ZIP directory (list of entries)
    // Returns an object where the keys are the file names and the values are CentralDirFileHeader objects
    // Note: Directories are also included in the list
    public getZipDirectory(): ZipDirectoryType {
        return this.entryTable;
    }

    // Convert Uint8Array to UTF-8 string
    // Uses TextDecoder if available, otherwise a polyfill
    // Note: The polyfill may be slow for large data
    public static convertUint8ArrayToUtf8(data: Uint8Array): string {
        return ZipFile.textDecoder.decode(data);
    }

    private static getUint16(data: Uint8Array, i: number): number {
        return ((data[i + 1]) << 8) | data[i];
    }

    private static getUint32(data: Uint8Array, i: number): number {
        return (data[i + 3] << 24) | (data[i + 2] << 16) | (data[i + 1] << 8) | data[i];
    }

    private readAsUTF8(offset: number, len: number): string {
        const data = this.data.subarray(offset, offset + len);
        return ZipFile.convertUint8ArrayToUtf8(data);
    }

    private readEocd(eocdPos: number): EndOfCentralDir { // read End of central directory
        const data = this.data;
        const eocd: EndOfCentralDir = {
            signature: ZipFile.getUint32(data, eocdPos),
            entries: ZipFile.getUint16(data, eocdPos + 10), // total number of central directory records
            cdfhOffset: ZipFile.getUint32(data, eocdPos + 16), // offset of start of central directory, relative to start of archive
            cdSize: ZipFile.getUint32(data, eocdPos + 20) // size of central directory (just for information)
        };

        return eocd;
    }

    private readCdfh(pos: number): CentralDirFileHeader { // read Central directory file header
        const data = this.data;
        const cdfh: CentralDirFileHeader = {
            signature: ZipFile.getUint32(data, pos),
            version: ZipFile.getUint16(data, pos + 6), // version needed to extract (minimum)
            flag: ZipFile.getUint16(data, pos + 8), // General purpose bit flag
            compressionMethod: ZipFile.getUint16(data, pos + 10), // compression method
            modificationTime: ZipFile.getUint16(data, pos + 12), // File last modification time (DOS time)
            crc: ZipFile.getUint32(data, pos + 16), // CRC-32 of uncompressed data
            compressedSize: ZipFile.getUint32(data, pos + 20), // compressed size
            size: ZipFile.getUint32(data, pos + 24), // Uncompressed size
            fileNameLength: ZipFile.getUint16(data, pos + 28), // file name length
            extraFieldLength: ZipFile.getUint16(data, pos + 30), // extra field length
            fileCommentLength: ZipFile.getUint16(data, pos + 32), // file comment length
            localOffset: ZipFile.getUint32(data, pos + 42), // relative offset of local file header

            // set later...
            name: "",
            isDirectory: false,
            extra: [] as unknown as Uint8Array,
            comment: "",
            timestamp: 0,
            dataStart: 0
        };

        return cdfh;
    }

    private readZipDirectory(): ZipDirectoryType {
        const maxEocdCommentLen = 0xffff,
            data = this.data,
            entryTable: ZipDirectoryType = {};

        // find End of central directory (EOCD) record
        let i = data.length - ZipConstants.eocdLen + 1, // +1 because of loop
            eocd: EndOfCentralDir | undefined;

        const n = Math.max(0, i - maxEocdCommentLen);

        while (i >= n) {
            i -= 1;
            if (ZipFile.getUint32(data, i) === ZipConstants.eocdSignature) {
                eocd = this.readEocd(i);
                if (ZipFile.getUint32(data, eocd.cdfhOffset) === ZipConstants.cdfhSignature) {
                    break; // looks good, so we assume that we have found the EOCD
                }
            }
        }
        if (!eocd) {
            throw new Error(`Zip: File ended abruptly: EOCD not found at pos ${i >= 0 ? i : 0}`);
        }

        const entries = eocd.entries;
        let offset = eocd.cdfhOffset;

        for (i = 0; i < entries; i += 1) {
            const cdfh = this.readCdfh(offset);

            if (cdfh.signature !== ZipConstants.cdfhSignature) {
                throw new Error(`Zip: Bad CDFH signatureat pos ${offset}`);
            }
            if (!cdfh.fileNameLength) {
                throw new Error(`Zip Entry name missing at pos ${offset}`);
            }
            offset += ZipConstants.cdfhLen;

            cdfh.name = this.readAsUTF8(offset, cdfh.fileNameLength);
            offset += cdfh.fileNameLength;
            cdfh.isDirectory = cdfh.name.charAt(cdfh.name.length - 1) === "/";

            cdfh.extra = this.data.subarray(offset, offset + cdfh.extraFieldLength);
            offset += cdfh.extraFieldLength;

            cdfh.comment = this.readAsUTF8(offset, cdfh.fileCommentLength);
            offset += cdfh.fileCommentLength;

            if ((cdfh.flag & 0x40) === 0x40) { // bit 6 set?
                throw new Error(`Zip: Strong encryption not suppoered.`);
            }

            if ((cdfh.flag & 0x2000) === 0x2000) { // bit 13 set?
                throw new Error(`Zip: Strong directory encryption not suppoered.`);
            }

            const dostime = cdfh.modificationTime;

            // year, month, day, hour, minute, second
            cdfh.timestamp = new Date(((dostime >> 25) & 0x7F) + 1980, ((dostime >> 21) & 0x0F) - 1, (dostime >> 16) & 0x1F, (dostime >> 11) & 0x1F, (dostime >> 5) & 0x3F, (dostime & 0x1F) << 1).getTime();

            // local file header... much more info
            if (ZipFile.getUint32(data, cdfh.localOffset) !== ZipConstants.lfhSignature) {
                console.error("Zip: readZipDirectory: LFH signature not found at offset", cdfh.localOffset);
            }

            const lfhExtrafieldLength = ZipFile.getUint16(data, cdfh.localOffset + 28); // extra field length

            cdfh.dataStart = cdfh.localOffset + ZipConstants.lfhLen + cdfh.name.length + lfhExtrafieldLength;

            entryTable[cdfh.name] = cdfh;
        }
        return entryTable;
    }

    private static fnInflateConstruct(codes: CodeType, lens2: number[], n: number): number {
        let i: number;

        for (i = 0; i <= 0xF; i += 1) {
            codes.count[i] = 0;
        }

        for (i = 0; i < n; i += 1) {
            codes.count[lens2[i]] += 1;
        }

        if (codes.count[0] === n) {
            return 0;
        }

        let left = 1;

        for (i = 1; i <= 0xF; i += 1) {
            if ((left = (left << 1) - codes.count[i]) < 0) {
                return left;
            }
        }

        const offs = [
            undefined,
            0
        ];

        for (i = 1; i < 0xF; i += 1) {
            offs[i + 1] = offs[i]! + codes.count[i];
        }

        for (i = 0; i < n; i += 1) {
            if (lens2[i] !== 0) {
                codes.symbol[offs[lens2[i]] as number] = i; // TTT
                (offs[lens2[i]] as number) += 1; // TTT
            }
        }
        return left;
    }

    private static fnConstructFixedHuffman(lens: number[], lenCode: CodeType, distCode: CodeType): void { //TTT untested?
        let symbol: number;

        for (symbol = 0; symbol < 0x90; symbol += 1) {
            lens[symbol] = 8;
        }
        for (; symbol < 0x100; symbol += 1) {
            lens[symbol] = 9;
        }
        for (; symbol < 0x118; symbol += 1) {
            lens[symbol] = 7;
        }
        for (; symbol < 0x120; symbol += 1) {
            lens[symbol] = 8;
        }
        ZipFile.fnInflateConstruct(lenCode, lens, 0x120);
        for (symbol = 0; symbol < 0x1E; symbol += 1) {
            lens[symbol] = 5;
        }
        ZipFile.fnInflateConstruct(distCode, lens, 0x1E);
    }

    private inflate(data: Uint8Array, offset: number, compressedSize: number, finalSize: number): Uint8Array {
        const startLens = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258],
            lExt = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0],
            dists = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577],
            dExt = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13],
            dynamicTableOrder = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15],
            bufEnd = offset + compressedSize,
            outBuf = new Uint8Array(finalSize);
        let inCnt = offset, // read position
            outCnt = 0, // bytes written to outbuf
            bitCnt = 0, // helper to keep track of where we are in #bits
            bitBuf = 0,
            distCode: CodeType,
            lenCode: CodeType,
            lens: number[];

        const fnBits = function (need: number) {
            let out = bitBuf;

            while (bitCnt < need) {
                if (inCnt === bufEnd) {
                    throw new Error(`Zip: inflate: Data overflow`);
                }
                out |= data[inCnt] << bitCnt;
                inCnt += 1;
                bitCnt += 8;
            }
            bitBuf = out >> need;
            bitCnt -= need;
            return out & ((1 << need) - 1);
        },

            fnDecode = function (codes: CodeType) {
                let code = 0,
                    first = 0,
                    i = 0;

                for (let j = 1; j <= 0xF; j += 1) {
                    code |= fnBits(1);
                    const count = codes.count[j];

                    if (code < first + count) {
                        return codes.symbol[i + (code - first)];
                    }
                    i += count;
                    first += count;
                    first <<= 1;
                    code <<= 1;
                }
                return null;
            },

            fnInflateStored = function () {
                bitBuf = 0;
                bitCnt = 0;
                if (inCnt + 4 > bufEnd) {
                    throw new Error(`Zip: inflate: Data overflow at pos ${inCnt}`);
                }

                let len = ZipFile.getUint16(data, inCnt);

                inCnt += 2;

                if (data[inCnt] !== (~len & 0xFF) || data[inCnt + 1] !== ((~len >> 8) & 0xFF)) {
                    throw new Error(`Zip: inflate: Bad length at pos ${inCnt}`);
                }
                inCnt += 2;

                if (inCnt + len > bufEnd) {
                    throw new Error(`Zip: inflate: Data overflow at pos ${inCnt}`);
                }

                // Compatibility: Instead of: outbuf.push.apply(outbuf, outbuf.slice(incnt, incnt + len)); outcnt += len; incnt += len;
                while (len) {
                    outBuf[outCnt] = data[inCnt];
                    outCnt += 1;
                    inCnt += 1;
                    len -= 1;
                }
            },

            fnConstructDynamicHuffman = function () {
                const nLen = fnBits(5) + 257,
                    nDist = fnBits(5) + 1,
                    nCode = fnBits(4) + 4;

                if (nLen > 0x11E || nDist > 0x1E) {
                    throw new Error(`Zip: inflate: length/distance code overflow`);
                }
                let i: number;

                for (i = 0; i < nCode; i += 1) {
                    lens[dynamicTableOrder[i]] = fnBits(3);
                }
                for (; i < 19; i += 1) {
                    lens[dynamicTableOrder[i]] = 0;
                }
                if (ZipFile.fnInflateConstruct(lenCode, lens, 19) !== 0) {
                    throw new Error(`Zip: inflate: length codes incomplete`);
                }

                for (i = 0; i < nLen + nDist;) {
                    let symbol = fnDecode(lenCode) as number; // TTT

                    if (symbol < 16) {
                        lens[i] = symbol;
                        i += 1;
                    } else {
                        let len = 0;

                        if (symbol === 16) {
                            if (i === 0) {
                                throw new Error(`Zip: inflate: repeat lengths with no first length`);
                            }
                            len = lens[i - 1];
                            symbol = 3 + fnBits(2);
                        } else if (symbol === 17) {
                            symbol = 3 + fnBits(3);
                        } else {
                            symbol = 11 + fnBits(7);
                        }

                        if (i + symbol > nLen + nDist) {
                            throw new Error(`Zip: inflate: more lengths than specified`);
                        }
                        while (symbol) {
                            lens[i] = len;
                            symbol -= 1;
                            i += 1;
                        }
                    }
                }
                const err1 = ZipFile.fnInflateConstruct(lenCode, lens, nLen),
                    err2 = ZipFile.fnInflateConstruct(distCode, lens.slice(nLen), nDist);

                if ((err1 < 0 || (err1 > 0 && nLen - lenCode.count[0] !== 1))
                    || (err2 < 0 || (err2 > 0 && nDist - distCode.count[0] !== 1))) {
                    throw new Error(`Zip: inflate: bad literal or length codes`);
                }
            },

            fnInflateHuffmann = function () {
                let symbol: number;

                do { // decode deflated data
                    symbol = fnDecode(lenCode) as number; // TTT
                    if (symbol < 256) {
                        outBuf[outCnt] = symbol;
                        outCnt += 1;
                    }
                    if (symbol > 256) {
                        symbol -= 257;
                        if (symbol > 28) {
                            throw new Error(`Zip: inflate: Invalid length/distance`);
                        }
                        let len = startLens[symbol] + fnBits(lExt[symbol]);

                        symbol = fnDecode(distCode) as number; // TTT
                        const dist = dists[symbol] + fnBits(dExt[symbol]);

                        if (dist > outCnt) {
                            throw new Error(`Zip: inflate: distance out of range`);
                        }
                        // instead of outbuf.slice, we use...
                        while (len) {
                            outBuf[outCnt] = outBuf[outCnt - dist];
                            len -= 1;
                            outCnt += 1;
                        }
                    }
                } while (symbol !== 256);
            };

        let last: number;

        do { // The actual inflation
            last = fnBits(1);
            const type = fnBits(2);

            switch (type) {
                case 0: // STORED
                    fnInflateStored();
                    break;
                case 1:
                case 2: // fixed (=1) or dynamic (=2) huffman
                    lenCode = {
                        count: [],
                        symbol: []
                    };
                    distCode = {
                        count: [],
                        symbol: []
                    };
                    lens = [];
                    if (type === 1) { // construct fixed huffman tables
                        ZipFile.fnConstructFixedHuffman(lens, lenCode, distCode);
                    } else { // construct dynamic huffman tables
                        fnConstructDynamicHuffman();
                    }

                    fnInflateHuffmann();

                    break;
                default:
                    throw new Error(`Zip: inflate: unsupported compression type ${type}`);
            }
        } while (!last);
        return outBuf;
    }

    // Read binary data of a file entry (decompressing and decrypting if needed)
    // password is required for encrypted files
    // Throws error if file not found, password missing or incorrect, or compression method not supported
    // Returns Uint8Array with file data
    // Note: Directories cannot be read (will throw "file not found" error)
    public readBinaryData(name: string, password?: string): Uint8Array {
        const data = this.data;
        const cdfh = this.entryTable[name];
        if (!cdfh) {
            throw new Error(`Zip: readBinaryData: File does not exist: ${name}`);
        }

        const isEncrypted = ZipCrypto.isEncrypted(cdfh);
        console.log(`Zip: Extracting ${name}: compressedSize=${cdfh.compressedSize} size=${cdfh.size} compressionMethod=${cdfh.compressionMethod} encrypted=${isEncrypted}`);

        let fileData = data.subarray(cdfh.dataStart, cdfh.dataStart + cdfh.compressedSize);
        if (isEncrypted) {
            if (!password) {
                throw new Error(`Zip: Password required`);
            }
            fileData = ZipCrypto.decrypt(fileData, cdfh, password); // read encrypted data (includes 12-byte header)
        }

        if (cdfh.compressionMethod === 0) { // stored
        } else if (cdfh.compressionMethod === 8) { // deflated
            fileData = this.inflate(fileData, 0, cdfh.compressedSize, cdfh.size);
        } else {
            throw new Error(`Zip: readBinaryData: compression method not supported ${cdfh.compressionMethod}`);
        }
        return fileData;
    }

    // Check if the data looks like a ZIP file
    // (checks only for Local File Header signature at the beginning of the file)
    public static isProbablyZipFile(data: Uint8Array): boolean {
        if (data.length < 4) {
            return false; // too short to be a valid ZIP file
        }
        // check for the Local File Header (LFH) signature at the beginning of the file (we ignore that there can be any preceding data)
        const lfhSignature = ZipConstants.lfhSignature;
        const i = 0; // we only check the first 4 bytes
        const firstFourBytes = (data[i + 3] << 24) | (data[i + 2] << 16) | (data[i + 1] << 8) | data[i];
        if (firstFourBytes !== lfhSignature) {
            return false; // does not start with the Local File Header signature
        }
        return true; // it looks like a ZIP file
    }
}
