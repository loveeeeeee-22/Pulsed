/** Instant fallback while a route segment loads (RSC + client page JS). */
export default function Loading() {
  return (
    <div className="pj-route-loading" style={{ padding: '28px 24px', minHeight: '72vh', maxWidth: '1200px' }}>
      <div className="pj-route-loading-bar" style={{ width: 'min(38%, 240px)', height: 13, borderRadius: 7, marginBottom: 22 }} />
      <div className="pj-route-loading-bar" style={{ width: '100%', height: 140, borderRadius: 14, marginBottom: 14 }} />
      <div className="pj-route-loading-bar" style={{ width: '100%', height: 220, borderRadius: 14 }} />
    </div>
  )
}
