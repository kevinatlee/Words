const maximumDateTimestamp = 8_640_000_000_000_000;
const maximumConfiguredLifetimeMs = 24 * 60 * 60 * 1_000;
const maximumSafeServerTimestamp =
  maximumDateTimestamp - maximumConfiguredLifetimeMs;

export function createSafeClock(
  source: () => number,
  createError: () => Error = () =>
    new Error('The server clock is unavailable.'),
): () => number {
  let lastSafeTimestamp: number | null = null;

  return () => {
    const timestamp = source();
    const isSafeTimestamp =
      Number.isSafeInteger(timestamp) &&
      timestamp >= 0 &&
      timestamp <= maximumSafeServerTimestamp;

    if (
      !isSafeTimestamp ||
      (lastSafeTimestamp !== null && timestamp < lastSafeTimestamp)
    ) {
      if (lastSafeTimestamp !== null) {
        return lastSafeTimestamp;
      }

      throw createError();
    }

    lastSafeTimestamp = timestamp;
    return timestamp;
  };
}
