import { useState } from 'react'
import { LogIn, UserPlus, Wallet } from 'lucide-react'
import { useApp } from '../hooks/useApp.js'
import { cx } from '../utils/ui.js'
import Button from '../components/common/Button.jsx'
import FormField from '../components/common/FormField.jsx'

const DEMO = { email: 'demo@pockit.app', password: 'Pockit@123' }

/** Sign in / create account. Shown when the API needs authentication. */
export default function Auth() {
  const { login, register } = useApp()
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ name: '', email: '', password: '', monthlyAllowance: '', college: '' })
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setErrors({})
    try {
      if (mode === 'login') await login({ email: form.email, password: form.password })
      else
        await register({
          name: form.name,
          email: form.email,
          password: form.password,
          monthlyAllowance: form.monthlyAllowance || '0',
          college: form.college,
        })
    } catch (err) {
      setErrors(err.fieldErrors ?? { form: err.message })
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col justify-center px-5 py-10">
      <div className="mb-8 flex flex-col items-center text-center">
        <span className="grid size-16 place-items-center rounded-3xl bg-indigo text-white shadow-card">
          <Wallet className="size-8" />
        </span>
        <h1 className="mt-4 text-3xl font-bold text-indigo">Pockit</h1>
        <p className="mt-1 text-sm text-muted">Know where your money goes. Stay in control.</p>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-1 rounded-full bg-line/60 p-1" role="tablist">
        {[
          ['login', 'Sign in'],
          ['register', 'Create account'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            onClick={() => {
              setMode(id)
              setErrors({})
            }}
            className={cx('rounded-full py-2.5 text-sm font-semibold transition', mode === id ? 'bg-surface text-indigo shadow-card' : 'text-muted')}
          >
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-4 rounded-card bg-surface p-5 shadow-card" noValidate>
        {mode === 'register' && <FormField label="Full name" autoComplete="name" value={form.name} onChange={set('name')} error={errors.name} />}
        <FormField label="Email" type="email" autoComplete="email" value={form.email} onChange={set('email')} error={errors.email} />
        <FormField
          label="Password"
          type="password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          value={form.password}
          onChange={set('password')}
          error={errors.password}
          hint={mode === 'register' ? 'At least 8 characters' : undefined}
        />
        {mode === 'register' && (
          <>
            <FormField
              label="Monthly allowance"
              prefix="₹"
              inputMode="decimal"
              value={form.monthlyAllowance}
              onChange={set('monthlyAllowance')}
              error={errors.monthlyAllowance}
              hint="We'll create a starter budget you can edit."
              placeholder="10000"
            />
            <FormField label="College (optional)" value={form.college} onChange={set('college')} error={errors.college} />
          </>
        )}

        {errors.form && <p className="rounded-2xl bg-error/10 px-4 py-3 text-sm text-error" role="alert">{errors.form}</p>}

        <Button type="submit" full size="lg" loading={busy} icon={mode === 'login' ? LogIn : UserPlus}>
          {mode === 'login' ? 'Sign in' : 'Create account'}
        </Button>
      </form>

      {mode === 'login' && (
        <button
          type="button"
          onClick={() => setForm((f) => ({ ...f, ...DEMO }))}
          className="mt-4 rounded-2xl bg-violet-soft/70 px-4 py-3 text-sm text-indigo"
        >
          Hackathon demo: tap to fill <strong>{DEMO.email}</strong> / <strong>{DEMO.password}</strong>
        </button>
      )}
    </div>
  )
}
