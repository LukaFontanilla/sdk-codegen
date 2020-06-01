/*

 MIT License

 Copyright (c) 2020 Looker Data Sciences, Inc.

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all
 copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 SOFTWARE.

 */

import { MockCrypto } from '@looker/sdk-test-utils'
import { OAuthSession } from './oauthSession'
import { DefaultSettings, IApiSettings } from './apiSettings'
import { BrowserCryptoHash, BrowserTransport } from './browserTransport'
import { NodeCryptoHash, NodeTransport } from './nodeTransport'
import { BrowserServices } from './browserServices'

describe('oauthSession', () => {
  const settings = {
    ...DefaultSettings(),
    base_url: 'https://myinstance.looker.com:19999',
    client_id: '123456',
    looker_url: 'https://myinstance.looker.com:9999',
    redirect_uri: 'https://myapp.com/redirect',
  } as IApiSettings

  it('fails if missing settings', () => {
    for (const key of ['client_id', 'redirect_uri', 'base_url', 'looker_url']) {
      const dup: any = { ...settings }
      delete dup[key]
      const svcs = new BrowserServices({ settings: dup })
      expect(() => new OAuthSession(svcs)).toThrow(
        `Missing required configuration setting: '${key}'`
      )
    }
  })

  it('defaults to BrowserTransport and BrowserCryptoHash', () => {
    const services = new BrowserServices({ settings: settings })
    const session = new OAuthSession(services)
    expect(session.transport).toBeInstanceOf(BrowserTransport)
    expect(session.crypto).toBeInstanceOf(BrowserCryptoHash)
  })

  it('accepts transport and crypto overrides via services', () => {
    const transport = new NodeTransport(settings)
    const crypto = new MockCrypto()
    const services = new BrowserServices({
      crypto,
      settings,
      transport,
    })
    const session = new OAuthSession(services)
    expect(session.crypto).toEqual(crypto)

    const session2 = new OAuthSession({
      crypto: crypto,
      settings: settings,
      transport: transport,
    })
    expect(session2.transport).toEqual(transport)
    expect(session2.crypto).toEqual(crypto)
  })

  // No need to test for property omission via duck type hash, since the
  // services param is not a partial, TypeScript will error for any hash
  // that does not provide all properties of IPlatformServices
  it('accepts transport and crypto overrides via duck type hash', () => {
    const transport = new NodeTransport(settings)
    const crypto = new MockCrypto()
    const session = new OAuthSession({
      crypto,
      settings,
      transport,
    })
    expect(session.transport).toEqual(transport)
    expect(session.crypto).toEqual(crypto)
  })

  it('createAuthCodeRequestUrl with live crypto', async () => {
    const services = new BrowserServices({
      crypto: new NodeCryptoHash(),
      settings,
    })
    const session = new OAuthSession(services)
    const urlstr = await session.createAuthCodeRequestUrl('api', 'mystate')
    expect(session.code_verifier).toBeDefined()
    expect((session.code_verifier || '').length).toEqual(64)

    const url = new URL(urlstr)
    expect(url.origin).toEqual(settings.looker_url)
    const params = url.searchParams
    const props: any = {}
    params.forEach((value, key) => {
      props[key] = value
    })
    delete props.code_challenge
    expect(props).toEqual({
      client_id: '123456',
      code_challenge_method: 'S256',
      redirect_uri: 'https://myapp.com/redirect',
      response_type: 'code',
      scope: 'api',
      state: 'mystate',
    })
  })

  it('createAuthCodeRequestUrl with mock constant code_verifier', async () => {
    const services = new BrowserServices({
      crypto: new MockCrypto(),
      settings,
    })
    const session = new OAuthSession(services)
    const urlstr = await session.createAuthCodeRequestUrl('api', 'mystate')
    expect(session.code_verifier).toEqual('feedface')
    const url = new URL(urlstr)
    expect(url.origin).toEqual(settings.looker_url)
    expect(url.pathname).toEqual('/auth')
    const params = url.searchParams
    const props: any = {}
    params.forEach((value, key) => {
      props[key] = value
    })
    expect(props).toEqual({
      client_id: '123456',
      code_challenge: 'baadf00d',
      code_challenge_method: 'S256',
      redirect_uri: 'https://myapp.com/redirect',
      response_type: 'code',
      scope: 'api',
      state: 'mystate',
    })
  })

  it('redeemAuthCode', async () => {
    const mockRequest = jest.fn().mockReturnValue({ ok: true, value: '' })
    const transport = new BrowserTransport(settings)
    transport.request = mockRequest as any
    const services = new BrowserServices({
      crypto: new MockCrypto(),
      settings,
      transport,
    })
    const session = new OAuthSession(services)
    await session.createAuthCodeRequestUrl('api', 'mystate')
    const authCode = 'abcdef'
    await session.redeemAuthCode(authCode)
    const expected_url = new URL(settings.base_url)
    expected_url.pathname = 'api/token'
    expect(mockRequest).toHaveBeenCalledWith(
      'POST',
      expected_url.toString(),
      undefined,
      {
        client_id: settings.client_id,
        code: authCode,
        code_verifier: 'feedface',
        grant_type: 'authorization_code',
        redirect_uri: settings.redirect_uri,
      }
    )
  })
})
