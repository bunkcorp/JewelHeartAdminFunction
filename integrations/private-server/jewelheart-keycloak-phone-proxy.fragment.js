/**
 * Proxy Keycloak phone OTP requests so IPv6 client addresses do not break token storage.
 * Browser -> api.karmadots.org/jewelheart/auth/phone/code -> Keycloak (localhost) with short X-Forwarded-For.
 */
function createJewelHeartKeycloakPhoneProxy({ keycloakBaseUrl = 'http://127.0.0.1:8080', realm = 'karmadots' } = {}) {
  const base = String(keycloakBaseUrl).replace(/\/$/, '');

  async function requestAuthenticationCode(phoneNumber) {
    const url = new URL(`${base}/realms/${realm}/sms/authentication-code`);
    url.searchParams.set('phoneNumber', phoneNumber);
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'X-Forwarded-For': '10.0.0.1' },
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { error: text || `HTTP ${res.status}` };
    }
    return { ok: res.ok, status: res.status, body: json };
  }

  function registerRoutes(router) {
    router.get('/auth/phone/code', async (req, res) => {
      const phoneNumber = typeof req.query.phoneNumber === 'string' ? req.query.phoneNumber.trim() : '';
      if (!phoneNumber) {
        res.status(400).json({ error: 'phoneNumber query param required (E.164)' });
        return;
      }
      try {
        const out = await requestAuthenticationCode(phoneNumber);
        res.status(out.status).json(out.body);
      } catch (e) {
        res.status(502).json({ error: String(e && e.message ? e.message : e) });
      }
    });
  }

  return { registerRoutes, requestAuthenticationCode };
}

module.exports = { createJewelHeartKeycloakPhoneProxy };
