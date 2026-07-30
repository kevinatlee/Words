import { randomBytes } from 'node:crypto';

const RANDOM_BYTE_COUNT = 6;
const RANDOM_VALUE_COUNT = 2 ** (RANDOM_BYTE_COUNT * 8);

export type RandomBytesSource = (size: number) => Buffer;

export type ServerRandomSource = {
  next: () => number;
};

export function createCryptoRandomSource(
  bytesSource: RandomBytesSource = randomBytes,
): ServerRandomSource {
  return {
    next(): number {
      const bytes = bytesSource(RANDOM_BYTE_COUNT);
      if (!Buffer.isBuffer(bytes) || bytes.length !== RANDOM_BYTE_COUNT) {
        throw new Error('The random byte source must return exactly 6 bytes.');
      }

      return bytes.readUIntBE(0, RANDOM_BYTE_COUNT) / RANDOM_VALUE_COUNT;
    },
  };
}
