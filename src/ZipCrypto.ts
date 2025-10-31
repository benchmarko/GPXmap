// ZipCrypto.ts
// Implementation of traditional PKWARE ZipCrypto algorithm
// Reference: https://pkwaredownloads.blob.core.windows.net/pkware-general/Documentation/APPNOTE-6.3.9.TXT (section 6.1)

// Public interface for parts of Central Directory File Header needed for decryption
export interface CentralDirFileHeaderPart {
    readonly flag: number // General purpose bit flag
        // bit 0: encrypted; bit 6: strong encryption; bit 13: central directory encrypted
    readonly modificationTime: number // File last modification time (DOS time)
    readonly crc: number // CRC-32 of uncompressed data
}

export class ZipCrypto {
    // Make sure to use Math.imul for 32 bit unsigend! (https://matthewtolman.com/article/unsigned-integers-in-javascript)

    private static createCrcTable(): Uint32Array {
        const crcTable = new Uint32Array(256);
        for (let i = 0; i < 256; i += 1) {
            let c = i;
            for (let j = 0; j < 8; j += 1) {
                c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
            }
            crcTable[i] = c >>> 0;
        }
        return crcTable;
    }

    private static crcTable?: Uint32Array = undefined;

    private static crc32(crc: number, c: number) {
        const crcTable = ZipCrypto.crcTable || (ZipCrypto.crcTable = ZipCrypto.createCrcTable());
        return ((crc >>> 8) ^ crcTable[(crc ^ c) & 0xff]) >>> 0;
    };

    private static updateKeys(keys: number[], c: number): void {
        keys[0] = ZipCrypto.crc32(keys[0], c);
        keys[1] = (keys[1] + (keys[0] & 0xff)) >>> 0;
        keys[1] = (Math.imul(keys[1], 134775813) >>> 0) + 1 >>> 0;
        keys[2] = ZipCrypto.crc32(keys[2], (keys[1] >>> 24) & 0xff);
    }

    private static initKeys(password: string): number[] {
        const keys = [0x12345678, 0x23456789, 0x34567890];
        for (let i = 0; i < password.length; i += 1) {
            ZipCrypto.updateKeys(keys, password.charCodeAt(i));
        }
        return keys;
    }

    private static decryptByte(keys: number[], c: number): number {
        const temp = (keys[2] | 2) >>> 0;

        const decrypted = c ^ ((Math.imul(temp, temp ^ 1) >>> 8) & 0xff);
        ZipCrypto.updateKeys(keys, decrypted);
        return decrypted;
    }

    //
    // Public API
    // 
    // Check if the file is encrypted
    static isEncrypted(cdfh: CentralDirFileHeaderPart) {
        return cdfh.flag & 1;
    }

    // Decrypt data with given password
    static decrypt(data: Uint8Array, cdfh: CentralDirFileHeaderPart, password: string): Uint8Array {
        const keys = ZipCrypto.initKeys(password);
        const decryptedHeader = new Uint8Array(12);
        for (let i = 0; i < 12; i += 1) {
            const c = ZipCrypto.decryptByte(keys, data[i]);
            decryptedHeader[i] = c;
        }

        let checkByte: number;
        if ((cdfh.flag & 0x8) !== 0) {
            checkByte = (cdfh.modificationTime >> 8) & 0xff; // check MSB of the file time
        } else {
            checkByte = (cdfh.crc >> 24) & 0xff; // check MSB of CRC
        }

        if (decryptedHeader[11] !== checkByte) {
            throw new Error("ZipCrypto: The password did not match.");
        }

        const out = new Uint8Array(data.length - 12);
        for (let i = 12; i < data.length; i += 1) {
            const c = ZipCrypto.decryptByte(keys, data[i]);
            out[i - 12] = c;
        }
        return out;
    }
}
