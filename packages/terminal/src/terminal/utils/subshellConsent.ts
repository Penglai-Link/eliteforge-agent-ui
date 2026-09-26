/**
 * Remembers, per host, whether the shell integration may be installed into a
 * subshell.
 *
 * Bootstrapping writes a command into a shell the user opened themselves, so the
 * default is to do nothing until they say yes. Choices are stored per host so
 * agreeing once for a build box does not agree for production.
 */

export type SubshellConsent = "allow" | "deny";

const STORAGE_KEY = "agent-ui-terminal.subshell-consent";

type ConsentMap = Record<string, SubshellConsent>;

export function readSubshellConsent(host: string): SubshellConsent | undefined {
  if (!host) {
    return undefined;
  }

  return readConsentMap()[host];
}

export function writeSubshellConsent(host: string, consent: SubshellConsent) {
  if (!host) {
    return;
  }

  const next = { ...readConsentMap(), [host]: consent };
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage can be unavailable (private mode, disabled cookies). Forgetting
    // the choice is harmless: the user is simply asked again next time.
  }
}

export function clearSubshellConsent() {
  try {
    globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    // Ignored for the same reason as above.
  }
}

function readConsentMap(): ConsentMap {
  let raw: string | null | undefined;
  try {
    raw = globalThis.localStorage?.getItem(STORAGE_KEY);
  } catch {
    return {};
  }
  if (!raw) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return {};
    }

    const entries = Object.entries(parsed as Record<string, unknown>).filter(
      (entry): entry is [string, SubshellConsent] =>
        entry[1] === "allow" || entry[1] === "deny",
    );
    return Object.fromEntries(entries);
  } catch {
    return {};
  }
}
