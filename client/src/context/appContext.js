import { createContext } from 'react'

/*
 * The context object lives in its own file so AppContext.jsx exports only a component.
 * This keeps Vite's Fast Refresh (instant hot reload) working for the provider.
 */
export const AppContext = createContext(null)
