import 'server-only';
import { loginClient } from './client';
import { describeRules, FALLBACK_RULES, passwordRules } from './flows';

/** ZITADEL's password rules as a sentence for the password forms. */
export async function passwordRulesText(orgId?: string): Promise<string> {
  try {
    return describeRules(await passwordRules(loginClient(), orgId));
  } catch {
    return describeRules(FALLBACK_RULES);
  }
}
