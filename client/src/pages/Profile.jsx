import { useState } from 'react'
import { ChevronRight, IndianRupee, LogOut, Pencil, PiggyBank, RotateCcw, ShieldCheck, Sparkles } from 'lucide-react'
import { Link } from 'react-router'
import { useApp } from '../hooks/useApp.js'
import { formatINR, fromPaise } from '../utils/money.js'
import Button from '../components/common/Button.jsx'
import Card from '../components/common/Card.jsx'
import FormField from '../components/common/FormField.jsx'
import Modal from '../components/common/Modal.jsx'
import Toggle from '../components/common/Toggle.jsx'

const THRESHOLDS = [60, 70, 80, 90]

export default function Profile() {
  const { user, settings, summary, updateSettings, updateProfile, resetDemoData, dataSource, logout } = useApp()
  const [modal, setModal] = useState(null) // 'allowance' | 'profile' | 'reset'
  const [error, setError] = useState('')
  const initials = user.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()

  // Toggles save immediately; the UI updates once the service confirms.
  const toggle = (key) => (value) => updateSettings({ [key]: value }).catch((e) => setError(e.message))

  return (
    <div className="space-y-4 pb-2">
      <Card className="flex items-center gap-4">
        <span className="grid size-16 shrink-0 place-items-center rounded-full bg-indigo font-heading text-xl font-bold text-white">{initials}</span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold text-ink">{user.name}</h1>
          <p className="truncate text-sm text-muted">{user.program}</p>
          <p className="truncate text-xs text-muted">
            {user.college} · {user.residence}
          </p>
          <p className="truncate text-xs text-muted">{user.email}</p>
        </div>
        <button type="button" onClick={() => setModal('profile')} aria-label="Edit profile" className="grid size-10 place-items-center rounded-full bg-bg text-royal">
          <Pencil className="size-4" />
        </button>
      </Card>

      {error && <p className="rounded-2xl bg-error/10 px-4 py-3 text-sm text-error">{error}</p>}

      <Section title="Allowance & currency">
        <Row icon={IndianRupee} title={formatINR(settings.monthlyAllowance)} subtitle={`Monthly allowance · resets on day ${settings.cycleResetDay}`}>
          <Button size="sm" variant="outline" onClick={() => setModal('allowance')}>
            Edit
          </Button>
        </Row>
        <Row icon={IndianRupee} title="Indian Rupee (₹ INR)" subtitle="Default currency">
          <span className="rounded-full bg-bg px-2.5 py-1 text-xs font-semibold text-muted">Locked</span>
        </Row>
      </Section>

      <Section title="Budget preferences">
        <Row icon={ShieldCheck} title="Pre-Payment Budget Guard" subtitle="Advisory check before payments. Never blocks you.">
          <Toggle checked={settings.guardEnabled} onChange={toggle('guardEnabled')} label="Pre-Payment Budget Guard" />
        </Row>
        <div className="py-3">
          <p className="text-sm font-medium text-ink">Warn when a category reaches</p>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {THRESHOLDS.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={settings.guardThreshold === t}
                disabled={!settings.guardEnabled}
                onClick={() => toggle('guardThreshold')(t)}
                className={`rounded-xl py-2 text-sm font-semibold transition disabled:opacity-40 ${settings.guardThreshold === t ? 'bg-indigo text-white' : 'bg-bg text-ink'}`}
              >
                {t}%
              </button>
            ))}
          </div>
        </div>
        <Row icon={Sparkles} title="Smart rebalancing" subtitle="Suggest moving money between categories">
          <Toggle checked={settings.smartRebalancing} onChange={toggle('smartRebalancing')} label="Smart rebalancing" />
        </Row>
      </Section>

      <Section title="Notifications">
        <Row title="Daily 9 PM spending recap" subtitle="A short summary of the day">
          <Toggle checked={settings.dailyRecap} onChange={toggle('dailyRecap')} label="Daily recap" />
        </Row>
        <Row title="Weekend night nudge" subtitle="A gentle reminder before late-night spends">
          <Toggle checked={settings.weekendNudge} onChange={toggle('weekendNudge')} label="Weekend nudge" />
        </Row>
        <Row title="Pace alerts" subtitle="When a category is used faster than the month">
          <Toggle checked={settings.paceAlerts} onChange={toggle('paceAlerts')} label="Pace alerts" />
        </Row>
      </Section>

      <Section title="Account">
        <LinkRow to="/goals" icon={PiggyBank} title="Savings goals" subtitle={`${formatINR(summary.savingsRemaining)} available to save this month`} />
        <LinkRow to="/onboarding" icon={Sparkles} title="Re-run AI budget setup" subtitle="Get a fresh suggested allocation" />
        <Row icon={RotateCcw} title="Reset demo data" subtitle="Restore the original sample data">
          <Button size="sm" variant="danger" onClick={() => setModal('reset')}>
            Reset
          </Button>
        </Row>
        {dataSource === 'api' && (
          <Row icon={LogOut} title="Log out" subtitle="Sign out of this device">
            <Button size="sm" variant="outline" onClick={logout}>
              Log out
            </Button>
          </Row>
        )}
      </Section>

      <p className="flex gap-2 rounded-2xl bg-violet-soft/70 px-4 py-3 text-xs text-indigo">
        <ShieldCheck className="size-4 shrink-0" />
        Advisory guarantee: Pockit never restricts or blocks your spending. It only helps you decide.
      </p>
      <p className="text-center text-xs text-muted">
        Pockit · {dataSource === 'api' ? 'synced with the Pockit server' : 'demo data stored on this device only'}
      </p>

      {modal === 'allowance' && <AllowanceModal current={settings.monthlyAllowance} allocated={summary.totalAllocated} onClose={() => setModal(null)} onSave={(v) => updateSettings({ monthlyAllowance: v })} />}
      {modal === 'profile' && <ProfileModal user={user} onClose={() => setModal(null)} onSave={updateProfile} />}
      {modal === 'reset' && (
        <Modal
          open
          onClose={() => setModal(null)}
          title="Reset demo data?"
          footer={
            <div className="flex gap-3">
              <Button variant="outline" full onClick={() => setModal(null)}>
                Cancel
              </Button>
              <Button variant="danger" full onClick={() => resetDemoData().then(() => setModal(null))}>
                Reset
              </Button>
            </div>
          }
        >
          <p className="pb-2 text-sm text-ink">All expenses, categories and goals you added will be replaced with the original sample data.</p>
        </Modal>
      )}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-xs font-semibold tracking-wider text-muted uppercase">{title}</h2>
      <Card className="divide-y divide-line py-1">{children}</Card>
    </section>
  )
}

function Row({ icon: Icon, title, subtitle, children }) {
  return (
    <div className="flex items-center gap-3 py-3">
      {Icon && (
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-bg text-indigo">
          <Icon className="size-5" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="font-medium text-ink">{title}</p>
        {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function LinkRow({ to, ...props }) {
  return (
    <Link to={to} className="block">
      <Row {...props}>
        <ChevronRight className="size-5 text-muted" />
      </Row>
    </Link>
  )
}

function AllowanceModal({ current, allocated, onClose, onSave }) {
  const [value, setValue] = useState(String(fromPaise(current)))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    setSaving(true)
    try {
      await onSave(value)
      onClose()
    } catch (e) {
      setError(e.fieldErrors?.amount ?? e.message)
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Monthly allowance" footer={<Button full size="lg" loading={saving} onClick={submit}>Save</Button>}>
      <FormField label="Amount you receive each month" prefix="₹" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} error={error} hint={`Your categories currently total ${formatINR(allocated)}.`} />
    </Modal>
  )
}

function ProfileModal({ user, onClose, onSave }) {
  const [form, setForm] = useState({ name: user.name, college: user.college, program: user.program })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit() {
    setSaving(true)
    try {
      await onSave({ ...form, firstName: form.name.trim().split(' ')[0] })
      onClose()
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Edit profile" footer={<Button full size="lg" loading={saving} onClick={submit}>Save</Button>}>
      <div className="space-y-4 pb-2">
        <FormField label="Full name" value={form.name} onChange={set('name')} error={error} />
        <FormField label="College" value={form.college} onChange={set('college')} />
        <FormField label="Program" value={form.program} onChange={set('program')} />
      </div>
    </Modal>
  )
}
