export abstract class Resource {
  constructor(
    protected readonly name: string,
    protected readonly region: string,
  ) {
  }

  abstract url(priority?: number): string;

  headers(): Headers {
    return new Headers({
      "Accept": "application/x-amz-json-1.1",
    });
  }

  toJSON(priority?: number): string | undefined {
    return undefined;
  }
}
