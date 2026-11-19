import { createContext, useContext, useState } from 'react'
import { createPortal } from 'react-dom'
import { LanguageToggle } from '../LanguageToggle.jsx'
import { ThemeToggle } from '../ThemeToggle.jsx'

const TopbarSlotContext = createContext(null)

export function EnvControls() {
  return (
    <div className="env-controls">
      <LanguageToggle />
      <ThemeToggle />
    </div>
  )
}

export function TopbarSlots({ children }) {
  const [node, setNode] = useState(null)
  return (
    <TopbarSlotContext.Provider value={{ node, setNode }}>
      {children}
    </TopbarSlotContext.Provider>
  )
}

export function TopbarSlot() {
  const slot = useContext(TopbarSlotContext)
  return <div className="topbar-slot" ref={slot?.setNode} />
}

export function TopbarExtra({ children }) {
  const slot = useContext(TopbarSlotContext)
  if (!slot?.node) return null
  return createPortal(children, slot.node)
}
