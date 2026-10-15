declare module 'pg' {
  export class Pool {
    constructor(options: {
      connectionString: string;
      max: number;
      connectionTimeoutMillis: number;
      idleTimeoutMillis: number;
    });
    on(event: 'error', listener: (error: Error) => void): this;
  }

  const pg: { Pool: typeof Pool };
  export default pg;
}
