declare module 'ali-oss' {
  interface OSSOptions {
    region?: string
    endpoint?: string
    accessKeyId: string
    accessKeySecret: string
    stsToken?: string
    bucket?: string
    secure?: boolean
    timeout?: number | string
  }

  interface PutResult {
    name: string
    url: string
    res: {
      status: number
      headers: Record<string, string>
    }
  }

  interface PutOptions {
    headers?: Record<string, string>
    mime?: string
    meta?: Record<string, string>
    callback?: {
      url: string
      body: string
      contentType?: string
    }
  }

  class OSS {
    constructor(options: OSSOptions)
    put(name: string, file: File | Buffer | Blob, options?: PutOptions): Promise<PutResult>
    delete(name: string): Promise<{ res: { status: number } }>
    get(name: string): Promise<{ content: Buffer; res: { status: number } }>
    signatureUrl(name: string, options?: { expires?: number }): string
  }

  export = OSS
}
