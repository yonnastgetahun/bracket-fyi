# Push Notification Setup

This Edge Function requires VAPID keys to send Web Push notifications.
Follow these steps **before** deploying the function or applying the migration.

---

## Step 1: Generate VAPID Keypair

```bash
npx web-push generate-vapid-keys --json
```

This outputs something like:

```json
{
  "publicKey": "BAQCEAYnzrCwOAOtOcRZ6yhe...",
  "privateKey": "your-private-key-base64url"
}
```

The `publicKey` is a URL-safe base64 string used on the client.
The `privateKey` is used to sign push requests server-side.

---

## Step 2: Convert to JWK Set (required by @negrel/webpush)

The `@negrel/webpush` library expects keys in JWK format.
Use the following Node.js snippet to convert:

```js
const { generateVAPIDKeys } = require('web-push')
// Or use the SubtleCrypto API directly to export as JWK
```

Alternatively, use an online VAPID-to-JWK converter, or generate keys
directly via the Web Crypto API and export as JWK:

```js
// Run once in Node.js to generate and export as JWK
const { webcrypto } = require('crypto')
const { subtle } = webcrypto

async function generateVapidJwk() {
  const keyPair = await subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey']
  )
  const publicJwk = await subtle.exportKey('jwk', keyPair.publicKey)
  const privateJwk = await subtle.exportKey('jwk', keyPair.privateKey)
  // The JWK set contains the private key (includes x, y, d fields)
  const jwkSet = { keys: [privateJwk] }
  console.log('Public key (base64url):', publicJwk.x) // simplified
  console.log('JWK set (store in Vault):', JSON.stringify(jwkSet))
}
generateVapidJwk()
```

The Vault secret should be the **full JWK set JSON string**, e.g.:

```json
{
  "keys": [
    {
      "kty": "EC",
      "crv": "P-256",
      "x": "...",
      "y": "...",
      "d": "...",
      "key_ops": ["sign"],
      "ext": true
    }
  ]
}
```

---

## Step 3: Store Public Key in Vercel

In the Vercel project dashboard (or via CLI):

```bash
vercel env add NEXT_PUBLIC_VAPID_PUBLIC_KEY
# Paste the base64url public key when prompted
# Add to: Production, Preview, Development
```

Also add the VAPID subject:

```bash
vercel env add VAPID_SUBJECT
# Value: mailto:yonnastgetahun@gmail.com
```

---

## Step 4: Store Private Key in Supabase Vault

In the Supabase SQL editor (remote project, not local):

```sql
select vault.create_secret(
  'vapid_keys_jwk',
  '{"keys":[{"kty":"EC","crv":"P-256","x":"...","y":"...","d":"..."}]}'
);
```

Replace the JSON value with your actual JWK set string.

---

## Step 5: Apply the Migration

```bash
supabase db push
```

Or apply `supabase/migrations/20260725000005_vapid_rpc.sql` manually in the Supabase SQL editor.

Verify the function exists:

```sql
select routine_name, security_type
from information_schema.routines
where routine_name = 'get_vapid_keys';
```

---

## Step 6: (Optional) Set VAPID_KEYS_JWK in Supabase Edge Function Secrets

As a fallback that avoids the Vault RPC round-trip on every push:

In the Supabase dashboard → Edge Functions → Secrets, add:

```
VAPID_KEYS_JWK = {"keys":[...]}
VAPID_SUBJECT = mailto:yonnastgetahun@gmail.com
```

The Edge Function checks this env var first and only falls back to Vault if it's unset.

---

## Step 7: Deploy the Edge Function

```bash
supabase functions deploy notify
```

---

## Verification

After setup, you can test the function with curl:

```bash
curl -X POST \
  https://<your-project-ref>.supabase.co/functions/v1/notify \
  -H "Authorization: Bearer <service-role-key>" \
  -H "Content-Type: application/json" \
  -d '{"leagueId":"<uuid>","title":"Test","body":"Hello from Bracket.fyi"}'
```

Expected response: `{"sent":0,"pruned":0,"errors":[],"reason":"no subscribers"}` (if no push subscriptions yet).
