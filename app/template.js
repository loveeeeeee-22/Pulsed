/**
 * Re-mounts on client navigations so we can run a short enter animation without
 * blocking the shell (sidebar) from staying mounted.
 */
export default function Template({ children }) {
  return <div className="pj-page-template">{children}</div>
}
