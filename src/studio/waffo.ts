import 'server-only';
import { Environment, Waffo } from '@waffo/waffo-node';

function requiredSetting(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}

export function getWaffoClient() {
  const mode = process.env.WAFFO_ENVIRONMENT || 'sandbox';
  if (mode !== 'sandbox' && mode !== 'production')
    throw new Error(`Invalid WAFFO_ENVIRONMENT: ${mode}`);
  return new Waffo({
    apiKey: requiredSetting('WAFFO_API_KEY'),
    privateKey: requiredSetting('WAFFO_PRIVATE_KEY'),
    waffoPublicKey: requiredSetting('WAFFO_PUBLIC_KEY'),
    merchantId: requiredSetting('WAFFO_MERCHANT_ID'),
    environment:
      mode === 'production' ? Environment.PRODUCTION : Environment.SANDBOX,
  });
}
