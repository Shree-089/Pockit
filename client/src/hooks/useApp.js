import { useContext } from 'react'
import { AppContext } from '../context/appContext.js'

/**
 * Access global Pockit state and actions from any component:
 *   const { summary, transactions, addExpense } = useApp()
 */
export function useApp() {
  const context = useContext(AppContext)
  if (!context) throw new Error('useApp() must be used inside <AppProvider>')
  return context
}
