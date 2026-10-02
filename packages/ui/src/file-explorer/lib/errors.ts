export class CorsError extends Error {
  constructor(message?: string) {
    super(message || 'CORS issue detected.')
    this.name = 'CorsError'
  }
}
