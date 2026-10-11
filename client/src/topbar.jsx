import { createContext, useContext, useState } from 'react'
import { createPortal } from 'react-dom'

const TopbarSlotContext = createContext(null)

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
