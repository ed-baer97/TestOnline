import os from 'node:os'

// Адреса компьютера в локальной сети: сначала 192.168.*, затем 10.* и 172.16–31.*.
export function lanAddresses() {
  const found = []
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const net of nets || []) {
      const family = net.family === 'IPv4' || net.family === 4
      if (!family || net.internal) continue
      found.push(net.address)
    }
  }
  const rank = (ip) => {
    if (ip.startsWith('192.168.')) return 3
    if (ip.startsWith('10.')) return 2
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return 1
    return 0
  }
  return found.sort((a, b) => rank(b) - rank(a))
}
