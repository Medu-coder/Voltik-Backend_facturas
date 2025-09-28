import { HttpError } from '@/lib/supabase'

export class CaptchaError extends HttpError {
  constructor(message: string, status = 400) {
    super(status, message)
    this.name = 'CaptchaError'
  }
}

type VerifyOptions = {
  token: string
  remoteIp?: string
}

type CaptchaConfig = {
  sharedSecret?: string
  captchaSecret?: string
  verificationEndpoint?: string
}

export async function verifyCaptcha({ token, remoteIp }: VerifyOptions, config: CaptchaConfig = {}): Promise<void> {
  if (!token) {
    throw new CaptchaError('Missing captcha token')
  }

  const sharedSecret = config.sharedSecret ?? process.env.PUBLIC_INTAKE_SHARED_SECRET
  if (sharedSecret) {
    if (token !== sharedSecret) {
      throw new CaptchaError('Invalid shared secret', 403)
    }
    return
  }

  const captchaSecret = config.captchaSecret ?? process.env.PUBLIC_INTAKE_CAPTCHA_SECRET
  if (!captchaSecret) {
    throw new CaptchaError('Captcha verification is not configured')
  }

  const endpoint = config.verificationEndpoint ?? 'https://hcaptcha.com/siteverify'

  const body = new URLSearchParams({
    secret: captchaSecret,
    response: token,
  })
  if (remoteIp) {
    body.set('remoteip', remoteIp)
  }

  let resp: Response
  try {
    resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    })
  } catch (error) {
    throw new CaptchaError(`Captcha verification failed: ${(error as Error).message}`, 502)
  }

  if (!resp.ok) {
    throw new CaptchaError(`Captcha verification failed with status ${resp.status}`, 502)
  }

  const data = (await resp.json()) as { success?: boolean; 'error-codes'?: string[] }
  if (!data.success) {
    const codes = data['error-codes']?.join(', ') ?? 'unknown'
    throw new CaptchaError(`Captcha rejected: ${codes}`, 403)
  }
}
