/**
 * Real license server client: the RapBooster license server (D160, REQUIREMENTS §1).
 *
 * The API is one route, the same one every RapBooster desktop app uses:
 *   GET https://rap.clatos.com/api/licenseactivation
 *       ?softwareId=26&key=…&hardwareId=…&softwareVersion=…&remarks=…
 * answering { isValid: 1 | 0, message, version, downloadLink, nameOnSoftware }.
 * The route only accepts GET (POST answers 405). The first valid call binds the
 * key to `hardwareId` on the server; a call from another machine is refused
 * with a message, which is shown to the user as is.
 *
 * There is no separate validate, transfer or deactivate endpoint: validate is
 * the same call, transfer cannot be done from the app (the vendor resets the
 * binding on the server), and deactivate only clears the local record.
 */
import type { ActivationRequest, LicenseOutcome, LicenseService } from './types'

/** Advance's product id on the license server (owner, 2026-10-20). */
export const ADVANCE_SOFTWARE_ID = '26'
export const DEFAULT_LICENSE_ENDPOINT = 'https://rap.clatos.com/api/licenseactivation'

export interface HttpLicenseConfig {
  /** Full route URL. Overridable only in unpackaged runs (E2E stub). */
  endpoint: string
  timeoutMs?: number
}

interface ServerResponse {
  isValid?: unknown
  message?: unknown
}

/** The server sends `isValid` loosely typed ("1", 1, true, …). */
function verdict(value: unknown): 'valid' | 'invalid' | 'unknown' {
  const s = String(value ?? '')
    .trim()
    .toLowerCase()
  if (s === '1' || s === 'true') return 'valid'
  if (s === '0' || s === 'false') return 'invalid'
  return 'unknown'
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 500) : null
}

export class HttpLicenseService implements LicenseService {
  constructor(private readonly config: HttpLicenseConfig) {}

  private async call(
    request: Omit<ActivationRequest, 'remarks'> & { remarks?: string },
    rejection: 'invalid' | 'revoked',
  ): Promise<LicenseOutcome> {
    const params = new URLSearchParams({
      softwareId: ADVANCE_SOFTWARE_ID,
      key: request.key.trim(),
      hardwareId: request.fingerprint,
      softwareVersion: request.appVersion,
      remarks: request.remarks ?? '',
    })

    let response: Response
    try {
      response = await fetch(`${this.config.endpoint}?${params.toString()}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 15_000),
      })
    } catch (err) {
      // Network failure, DNS failure, timeout — all non-punitive.
      return {
        kind: 'unreachable',
        detail: err instanceof Error ? err.message : String(err),
      }
    }

    const payload = (await response.json().catch(() => null)) as ServerResponse | null
    switch (
      payload && typeof payload === 'object' ? verdict(payload.isValid) : 'unknown'
    ) {
      case 'valid':
        return { kind: 'valid', expiresAt: null, deviceName: null }
      case 'invalid': {
        const reason = text(payload?.message) ?? 'This license key is not valid.'
        return rejection === 'revoked'
          ? { kind: 'revoked', reason }
          : { kind: 'invalid', reason }
      }
      default:
        // WHY `unreachable` and not `invalid`: we could not understand the
        // reply (an HTML error page from a CDN or captive portal, a 429, a 5xx,
        // a proxy rewriting the body). Reading that as "your licence is bad"
        // would clear the activation of a paying customer for a fault on our
        // side of the wire. `unreachable` maps to the bounded grace period, and
        // cannot be used to skip activation: `apply()` persists nothing except
        // on `valid`. Only an explicit `isValid: 0` is a rejection.
        return {
          kind: 'unreachable',
          detail: `unrecognised response (HTTP ${response.status})`,
        }
    }
  }

  activate(request: ActivationRequest): Promise<LicenseOutcome> {
    return this.call(request, 'invalid')
  }

  /** No server-side transfer: the same call, which the server refuses while the key is bound elsewhere. */
  transfer(request: ActivationRequest): Promise<LicenseOutcome> {
    return this.call(request, 'invalid')
  }

  /** A key that was accepted before and is now refused has been revoked (or moved) on the server. */
  validate(request: Omit<ActivationRequest, 'remarks'>): Promise<LicenseOutcome> {
    return this.call(request, 'revoked')
  }

  /** The server has no release call; the manager clears the local record. */
  deactivate(): Promise<LicenseOutcome> {
    return Promise.resolve({ kind: 'valid', expiresAt: null, deviceName: null })
  }
}
