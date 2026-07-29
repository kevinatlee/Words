export function verifyClientSourceExclusion(options: {
  readonly repositoryRoot: string;
  readonly dictionarySha256: string;
}): Promise<void>;

export function verifyClientBuildExclusion(options: {
  readonly repositoryRoot: string;
  readonly dictionarySha256: string;
}): Promise<void>;
