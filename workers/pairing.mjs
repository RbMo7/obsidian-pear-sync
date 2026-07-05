import b4a from 'b4a'

const INVITE_PREFIX = 'pear-sync:'

export function generateInvite(driveKey) {
  const encoded = b4a.toString(driveKey, 'hex')
  return INVITE_PREFIX + encoded
}

export function parseInvite(invite) {
  const trimmed = invite.trim()
  if (!trimmed.startsWith(INVITE_PREFIX)) return null
  const encoded = trimmed.slice(INVITE_PREFIX.length)
  try {
    return b4a.from(encoded, 'hex')
  } catch {
    return null
  }
}
