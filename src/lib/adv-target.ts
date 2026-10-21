/** When a GitHub release ships both bins, keep the Adv file. */
export function chooseCardputerAsset(names: string[], preferred: string): string {
  const adv = names.filter((name) => isAdvCardputerAsset(name) && /\.(bin|zip)$/i.test(name))
  if (isPlainCardputerAsset(preferred) && adv.length > 0) return preferAsset(adv)
  return preferred
}

export function isAdvCardputerAsset(name: string): boolean {
  const normalized = name.toLowerCase()
  return /cardputer[\s._-]*adv|adv[\s._-]*cardputer|cardputeradv/.test(normalized)
}

export function isPlainCardputerAsset(name: string): boolean {
  const normalized = name.toLowerCase()
  if (!/\.(bin|zip)$/i.test(normalized) || isAdvCardputerAsset(normalized)) return false
  return normalized.includes("cardputer")
}

function preferAsset(names: string[]): string {
  const rank = (name: string) => {
    const normalized = name.toLowerCase()
    if (normalized.includes("merged") && normalized.endsWith(".bin")) return 0
    if (normalized.endsWith(".bin")) return 1
    if (normalized.includes("full") && normalized.endsWith(".zip")) return 2
    return 3
  }
  return [...names].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))[0] ?? names[0] ?? ""
}
