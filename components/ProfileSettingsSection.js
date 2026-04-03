'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Country, City } from 'country-state-city'
import { supabase } from '@/lib/supabase'
import AvatarCropModal from '@/components/AvatarCropModal'

const GENDERS = [
  { value: '', label: 'Select…' },
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'non_binary', label: 'Non-binary' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
  { value: 'other', label: 'Other' },
]

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  borderRadius: '8px',
  border: '1px solid var(--border)',
  background: 'var(--bg3)',
  color: 'var(--text)',
  padding: '10px 12px',
  fontSize: '13px',
  fontFamily: 'monospace',
}

const labelStyle = {
  display: 'block',
  fontSize: '11px',
  fontFamily: 'monospace',
  color: 'var(--text3)',
  marginBottom: '6px',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
}

function formatJoined(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return '—'
  }
}

export default function ProfileSettingsSection() {
  const [sessionUser, setSessionUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(false)
  const [saveStatus, setSaveStatus] = useState({ type: '', text: '' })
  const [saving, setSaving] = useState(false)

  const [username, setUsername] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [gender, setGender] = useState('')
  const [countryCode, setCountryCode] = useState('')
  const [city, setCity] = useState('')
  const [street, setStreet] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [phone, setPhone] = useState('')

  const [avatarUrl, setAvatarUrl] = useState(null)
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState(null)
  const [removeAvatarNextSave, setRemoveAvatarNextSave] = useState(false)
  const [cropModalSrc, setCropModalSrc] = useState(null)
  const fileInputRef = useRef(null)

  const [cityQuery, setCityQuery] = useState('')
  const [cityOpen, setCityOpen] = useState(false)
  const cityWrapRef = useRef(null)

  const officialName = useMemo(() => {
    const s = `${firstName.trim()} ${lastName.trim()}`.trim()
    return { text: s || 'Add your name', isPlaceholder: !s }
  }, [firstName, lastName])

  const countriesSorted = useMemo(() => {
    const list = Country.getAllCountries()
    return [...list].sort((a, b) => a.name.localeCompare(b.name))
  }, [])

  const citiesForCountry = useMemo(() => {
    if (!countryCode) return []
    const raw = City.getCitiesOfCountry(countryCode)
    if (!raw?.length) return []
    return City.sortByStateAndName([...raw])
  }, [countryCode])

  const filteredCities = useMemo(() => {
    const q = cityQuery.trim().toLowerCase()
    if (!q) return citiesForCountry.slice(0, 80)
    return citiesForCountry.filter(c => c.name.toLowerCase().includes(q)).slice(0, 80)
  }, [citiesForCountry, cityQuery])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return
      setSessionUser(session?.user ?? null)
      setAuthLoading(false)
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setSessionUser(session?.user ?? null)
    })
    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!sessionUser?.id) return
    let cancelled = false
    ;(async () => {
      setProfileLoading(true)
      const { data, error } = await supabase.from('profiles').select('*').eq('id', sessionUser.id).maybeSingle()
      if (cancelled) return
      if (error) {
        setSaveStatus({
          type: 'warn',
          text:
            error.message?.includes('relation') || error.code === '42P01'
              ? 'Profile table not found. Run the SQL migration in supabase/migrations on your Supabase project, then refresh.'
              : `Could not load profile: ${error.message}`,
        })
        setProfileLoading(false)
        return
      }
      if (data) {
        setUsername(data.username || '')
        setContactEmail(data.contact_email || sessionUser.email || '')
        setFirstName(data.first_name || '')
        setLastName(data.last_name || '')
        setDateOfBirth(data.date_of_birth || '')
        setGender(data.gender || '')
        setCountryCode(data.country_code || '')
        setCity(data.city || '')
        setCityQuery(data.city || '')
        setStreet(data.street || '')
        setPostalCode(data.postal_code || '')
        setPhone(data.phone || '')
        setAvatarUrl(data.avatar_url || null)
      } else {
        setContactEmail(sessionUser.email || '')
      }
      setProfileLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [sessionUser?.id, sessionUser?.email])

  useEffect(() => {
    return () => {
      if (avatarPreview?.startsWith('blob:')) URL.revokeObjectURL(avatarPreview)
      if (cropModalSrc) URL.revokeObjectURL(cropModalSrc)
    }
  }, [avatarPreview, cropModalSrc])

  useEffect(() => {
    function onDocClick(e) {
      if (cityWrapRef.current && !cityWrapRef.current.contains(e.target)) setCityOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const displayAvatar = removeAvatarNextSave
    ? null
    : avatarPreview || avatarUrl || null

  const onPickFile = e => {
    const f = e.target.files?.[0]
    if (!f || !f.type.startsWith('image/')) return
    if (cropModalSrc) URL.revokeObjectURL(cropModalSrc)
    setCropModalSrc(URL.createObjectURL(f))
    e.target.value = ''
  }

  function closeCropModal() {
    if (cropModalSrc) URL.revokeObjectURL(cropModalSrc)
    setCropModalSrc(null)
  }

  function onCropComplete(file) {
    closeCropModal()
    if (avatarPreview?.startsWith('blob:')) URL.revokeObjectURL(avatarPreview)
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
    setRemoveAvatarNextSave(false)
  }

  const clearAvatar = () => {
    if (avatarPreview?.startsWith('blob:')) URL.revokeObjectURL(avatarPreview)
    setAvatarFile(null)
    setAvatarPreview(null)
    setRemoveAvatarNextSave(true)
  }

  const onCountryChange = e => {
    const code = e.target.value
    setCountryCode(code)
    setCity('')
    setCityQuery('')
  }

  const pickCity = useCallback(
    name => {
      setCity(name)
      setCityQuery(name)
      setCityOpen(false)
    },
    []
  )

  async function handleSave(e) {
    e.preventDefault()
    if (!sessionUser?.id) return
    setSaving(true)
    setSaveStatus({ type: '', text: '' })

    let nextAvatarUrl = removeAvatarNextSave ? null : avatarUrl
    let avatarWarn = ''

    if (avatarFile && sessionUser.id) {
      const path = `${sessionUser.id}/${Date.now()}.jpg`
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, avatarFile, {
        upsert: true,
        contentType: 'image/jpeg',
      })
      if (upErr) {
        avatarWarn = `Photo not uploaded (${upErr.message}). Create an "avatars" bucket in Storage with upload access for signed-in users. `
        nextAvatarUrl = avatarUrl
      } else {
        const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
        nextAvatarUrl = pub.publicUrl
      }
    }

    const row = {
      id: sessionUser.id,
      username: username.trim() || null,
      contact_email: contactEmail.trim() || null,
      first_name: firstName.trim() || null,
      last_name: lastName.trim() || null,
      date_of_birth: dateOfBirth || null,
      gender: gender || null,
      country_code: countryCode || null,
      city: city.trim() || null,
      street: street.trim() || null,
      postal_code: postalCode.trim() || null,
      phone: phone.trim() || null,
      avatar_url: nextAvatarUrl,
    }

    const { error } = await supabase.from('profiles').upsert(row, { onConflict: 'id' })
    if (error) {
      const taken = error.code === '23505' && /username/i.test(error.message + (error.details || ''))
      setSaveStatus({
        type: 'error',
        text: taken
          ? 'That username is already taken. Try another.'
          : error.message?.includes('relation') || error.code === '42P01'
            ? 'The profiles table is missing or needs new columns (username, contact_email). Run the migrations in the Supabase SQL editor.'
            : error.message,
      })
      setSaving(false)
      return
    }

    setAvatarUrl(nextAvatarUrl)
    setAvatarFile(null)
    if (avatarPreview?.startsWith('blob:')) URL.revokeObjectURL(avatarPreview)
    setAvatarPreview(null)
    setRemoveAvatarNextSave(false)
    setSaveStatus({
      type: avatarWarn ? 'warn' : 'ok',
      text: avatarWarn ? `${avatarWarn}Other profile details were saved.` : 'Profile saved.',
    })
    setSaving(false)
  }

  if (authLoading) {
    return <p style={{ fontSize: '13px', color: 'var(--text3)' }}>Loading…</p>
  }

  if (!sessionUser) {
    return (
      <p style={{ fontSize: '13px', color: 'var(--text2)' }}>
        Sign in to manage your profile.{' '}
        <a href="/auth" style={{ color: 'var(--accent)' }}>
          Go to sign in
        </a>
      </p>
    )
  }

  const joined = formatJoined(sessionUser.created_at)

  return (
    <form onSubmit={handleSave} style={{ display: 'grid', gap: '20px' }}>
      {cropModalSrc && (
        <AvatarCropModal imageSrc={cropModalSrc} onClose={closeCropModal} onComplete={onCropComplete} />
      )}
      {saveStatus.text && (
        <div
          style={{
            borderRadius: '8px',
            border:
              saveStatus.type === 'error'
                ? '1px solid rgba(239,68,68,0.45)'
                : saveStatus.type === 'warn'
                  ? '1px solid rgba(234,179,8,0.45)'
                  : '1px solid rgba(34,197,94,0.45)',
            background:
              saveStatus.type === 'error'
                ? 'rgba(239,68,68,0.08)'
                : saveStatus.type === 'warn'
                  ? 'rgba(234,179,8,0.08)'
                  : 'rgba(34,197,94,0.08)',
            color: saveStatus.type === 'error' ? '#fca5a5' : saveStatus.type === 'warn' ? '#fde047' : '#86efac',
            padding: '10px 12px',
            fontSize: '12px',
            fontFamily: 'monospace',
          }}
        >
          {saveStatus.text}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '16px',
          paddingBottom: '8px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ position: 'relative' }}>
          <div
            style={{
              width: '88px',
              height: '88px',
              borderRadius: '50%',
              border: '2px solid var(--border)',
              background: 'var(--bg3)',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {displayAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={displayAvatar}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
              />
            ) : (
              <span style={{ fontSize: '28px', color: 'var(--text3)' }}>?</span>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={onPickFile} style={{ display: 'none' }} />
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--bg3)',
                color: 'var(--text2)',
                padding: '6px 10px',
                fontSize: '11px',
                fontFamily: 'monospace',
                cursor: 'pointer',
              }}
            >
              {displayAvatar ? 'Change photo' : 'Upload photo'}
            </button>
            {(displayAvatar || avatarUrl) && (
              <button
                type="button"
                onClick={clearAvatar}
                style={{
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--text3)',
                  padding: '6px 10px',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                }}
              >
                Remove
              </button>
            )}
          </div>
        </div>
        <div style={{ minWidth: '200px', flex: '1' }}>
          <div
            style={{
              fontSize: '18px',
              color: officialName.isPlaceholder ? 'var(--text3)' : 'var(--text)',
            }}
          >
            {officialName.text}
          </div>
          <div style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text3)', marginTop: '6px' }}>
            Joined {joined}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '14px' }}>
        <div>
          <label style={labelStyle}>Username</label>
          <input
            style={inputStyle}
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoComplete="username"
            placeholder="Shown on your dashboard"
          />
        </div>
        <div>
          <label style={labelStyle}>Email</label>
          <input
            style={inputStyle}
            type="email"
            value={contactEmail}
            onChange={e => setContactEmail(e.target.value)}
            autoComplete="email"
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '14px' }}>
        <div>
          <label style={labelStyle}>First name</label>
          <input style={inputStyle} value={firstName} onChange={e => setFirstName(e.target.value)} autoComplete="given-name" />
        </div>
        <div>
          <label style={labelStyle}>Last name</label>
          <input style={inputStyle} value={lastName} onChange={e => setLastName(e.target.value)} autoComplete="family-name" />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '14px' }}>
        <div>
          <label style={labelStyle}>Date of birth</label>
          <input
            style={inputStyle}
            type="date"
            value={dateOfBirth}
            onChange={e => setDateOfBirth(e.target.value)}
          />
        </div>
        <div>
          <label style={labelStyle}>Gender</label>
          <select style={{ ...inputStyle, cursor: 'pointer' }} value={gender} onChange={e => setGender(e.target.value)}>
            {GENDERS.map(g => (
              <option key={g.value || 'empty'} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '14px' }}>
        <div>
          <label style={labelStyle}>Country</label>
          <select style={{ ...inputStyle, cursor: 'pointer' }} value={countryCode} onChange={onCountryChange}>
            <option value="">Select country…</option>
            {countriesSorted.map(c => (
              <option key={c.isoCode} value={c.isoCode}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div ref={cityWrapRef} style={{ position: 'relative' }}>
          <label style={labelStyle}>City</label>
          <input
            style={inputStyle}
            value={cityQuery}
            onChange={e => {
              setCityQuery(e.target.value)
              setCity(e.target.value)
              setCityOpen(true)
            }}
            onFocus={() => setCityOpen(true)}
            placeholder={countryCode ? 'Search or pick a city…' : 'Select a country first'}
            disabled={!countryCode}
            autoComplete="address-level2"
          />
          {cityOpen && countryCode && filteredCities.length > 0 && (
            <ul
              style={{
                position: 'absolute',
                zIndex: 10,
                left: 0,
                right: 0,
                maxHeight: '220px',
                overflowY: 'auto',
                margin: '4px 0 0',
                padding: '6px 0',
                listStyle: 'none',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--card-bg)',
                boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
              }}
            >
              {filteredCities.map(c => (
                <li key={`${c.name}-${c.stateCode}`}>
                  <button
                    type="button"
                    onClick={() => pickCity(c.name)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--text2)',
                      padding: '8px 12px',
                      fontSize: '12px',
                      fontFamily: 'monospace',
                      cursor: 'pointer',
                    }}
                  >
                    {c.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {countryCode && citiesForCountry.length === 0 && (
            <p style={{ fontSize: '11px', color: 'var(--text3)', margin: '6px 0 0' }}>
              No city list for this country — type your city manually.
            </p>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '14px' }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Street</label>
          <input style={inputStyle} value={street} onChange={e => setStreet(e.target.value)} autoComplete="street-address" />
        </div>
        <div>
          <label style={labelStyle}>Postal code</label>
          <input style={inputStyle} value={postalCode} onChange={e => setPostalCode(e.target.value)} autoComplete="postal-code" />
        </div>
        <div>
          <label style={labelStyle}>Phone number</label>
          <input style={inputStyle} type="tel" value={phone} onChange={e => setPhone(e.target.value)} autoComplete="tel" />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '8px' }}>
        <button
          type="submit"
          disabled={saving || profileLoading}
          style={{
            borderRadius: '10px',
            border: '1px solid var(--accent)',
            background: 'var(--accent)',
            color: '#fff',
            padding: '10px 20px',
            fontSize: '13px',
            fontFamily: 'monospace',
            cursor: saving || profileLoading ? 'wait' : 'pointer',
            opacity: saving || profileLoading ? 0.7 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Save profile'}
        </button>
      </div>
    </form>
  )
}
