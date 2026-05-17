import { Navigate } from 'react-router-dom'

/**
 * PrivateRoute — wraps any page that requires authentication.
 * If no JWT token is found in localStorage, redirects to /login.
 */
export default function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token')
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}
