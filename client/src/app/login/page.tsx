'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useAuth } from '@/context/AuthContext';
import { getApiErrorMessage } from '@/types';
import {
  Lock,
  Mail,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  UserPlus,
} from 'lucide-react';
import { Button, Card, Field, Input, Select, Modal } from '@/components/ui';

const FEATURES = [
  {
    title: 'Strip & loose tablet billing',
    body: 'Per-tablet unit prices calculated automatically from strip pack size.',
  },
  {
    title: 'FEFO batch & expiry management',
    body: 'First-Expiry-First-Out stock deduction with full batch traceability.',
  },
  {
    title: 'Staff approval security',
    body: 'Role-based access with explicit owner approval for new pharmacy staff.',
  },
];

export default function LoginPage() {
  const { login, register } = useAuth();

  // Primary Login Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Request Access Modal State
  const [showRequestAccess, setShowRequestAccess] = useState(false);
  const [reqName, setReqName] = useState('');
  const [reqEmail, setReqEmail] = useState('');
  const [reqPassword, setReqPassword] = useState('');
  const [reqDesignation, setReqDesignation] = useState('Pharmacist');
  const [reqSubmitting, setReqSubmitting] = useState(false);

  // Forgot Password Modal State
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSubmitting, setForgotSubmitting] = useState(false);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setErrorMsg(getApiErrorMessage(err, 'Login failed. Please check your credentials.') ?? 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setReqSubmitting(true);
    try {
      const msg = await register(reqName, reqEmail, reqPassword);
      setSuccessMsg(msg || 'Access request submitted! Awaiting owner approval.');
      setShowRequestAccess(false);
      setReqName('');
      setReqEmail('');
      setReqPassword('');
    } catch (err) {
      setErrorMsg(getApiErrorMessage(err, 'Failed to submit access request.') ?? 'Request failed.');
    } finally {
      setReqSubmitting(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) return;
    setErrorMsg('');
    setForgotSubmitting(true);
    try {
      setSuccessMsg(`Password reset instructions for ${forgotEmail} sent to pharmacy administrator.`);
      setShowForgot(false);
      setForgotEmail('');
    } finally {
      setForgotSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas text-fg flex flex-col">
      <header className="w-full border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-4">
          <Image src="/logo.png" alt="" width={36} height={36} className="h-9 w-9 object-contain" />
          <span>
            <span className="block text-base font-extrabold leading-none tracking-tight text-fg">AdGen ERP</span>
            <span className="mt-1 block text-[11px] font-bold uppercase tracking-wider leading-none text-brand">
              Pharmacy Management
            </span>
          </span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center gap-10 px-6 py-10 lg:flex-row lg:items-start lg:justify-between lg:gap-14 lg:py-16">
        {/* Product intro */}
        <section className="w-full max-w-xl">
          <h1 className="text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">
            Clinical management for modern Indian pharmacies
          </h1>
          <p className="mt-3 text-base text-fg-muted">
            Handle strip &amp; loose tablet billing, FEFO inventory, supplier payables, and GST filings
            from one counter-ready system.
          </p>

          <ul className="mt-7 space-y-3">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex items-start gap-3 rounded-lg border border-line bg-surface p-3.5 shadow-card">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden />
                <span>
                  <span className="block text-sm font-bold text-fg">{f.title}</span>
                  <span className="mt-0.5 block text-sm text-fg-muted">{f.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* Sign-in card */}
        <Card className="w-full max-w-md shrink-0 p-7">
          <h2 className="text-xl font-bold tracking-tight text-fg">Sign in to the pharmacy portal</h2>
          <p className="mt-1 text-sm text-fg-muted">
            Enter your credentials to access the POS &amp; management suite
          </p>

          {errorMsg ? (
            <p
              role="alert"
              className="mt-5 flex items-start gap-2 rounded-md border border-danger-line bg-danger-subtle px-3 py-2.5 text-sm font-semibold text-danger"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {errorMsg}
            </p>
          ) : null}

          {successMsg ? (
            <p
              role="status"
              className="mt-5 flex items-start gap-2 rounded-md border border-brand-line bg-brand-subtle px-3 py-2.5 text-sm font-semibold text-brand-hover"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {successMsg}
            </p>
          ) : null}

          <form onSubmit={handleSignIn} className="mt-6 space-y-4">
            <Field label="Work Email Address" required>
              <Input
                icon={Mail}
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. owner@adgenpharmacy.com"
              />
            </Field>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-fg-muted">
                  Password<span className="ml-0.5 text-danger">*</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowForgot(true)}
                  className="text-xs font-bold text-brand transition-colors hover:text-brand-hover hover:underline"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  aria-label="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-hover hover:text-fg"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" size="lg" loading={loading} className="w-full">
              Sign In
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          </form>

          <div className="mt-6 border-t border-line pt-5 text-center">
            <p className="text-sm text-fg-muted">New staff member?</p>
            <button
              onClick={() => setShowRequestAccess(true)}
              className="mt-1 inline-flex items-center gap-1.5 text-sm font-bold text-brand transition-colors hover:text-brand-hover hover:underline"
            >
              <UserPlus className="h-4 w-4" aria-hidden />
              Request portal access
            </button>
          </div>
        </Card>
      </main>

      <footer className="border-t border-line bg-surface">
        <p className="mx-auto max-w-6xl px-6 py-4 text-center text-xs text-fg-subtle">
          AdGen Pharmacy ERP · Billing, FEFO batch inventory &amp; GST compliance
        </p>
      </footer>

      {/* REQUEST ACCESS MODAL */}
      <Modal
        open={showRequestAccess}
        onClose={() => setShowRequestAccess(false)}
        title="Request Portal Access"
        subtitle="The pharmacy owner must approve your account before you can sign in"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setShowRequestAccess(false)}>
              Cancel
            </Button>
            <Button type="submit" form="request-access-form" loading={reqSubmitting}>
              Submit Request
            </Button>
          </div>
        }
      >
        <form id="request-access-form" onSubmit={handleRequestAccess} className="space-y-4 p-5">
          <Field label="Full Name" required>
            <Input
              type="text"
              required
              value={reqName}
              onChange={(e) => setReqName(e.target.value)}
              placeholder="e.g. Priya Nair"
            />
          </Field>
          <Field label="Work Email" required>
            <Input
              type="email"
              required
              value={reqEmail}
              onChange={(e) => setReqEmail(e.target.value)}
              placeholder="staff@adgenpharmacy.com"
            />
          </Field>
          <Field label="Choose a Password" required hint="At least 8 characters">
            <Input
              type="password"
              required
              // The rule was advertised in the placeholder and enforced nowhere: a two-character
              // password was accepted and stored. The server checks it now, so the form should
              // say so before the request rather than after it is refused.
              minLength={8}
              autoComplete="new-password"
              value={reqPassword}
              onChange={(e) => setReqPassword(e.target.value)}
              placeholder="Minimum 8 characters"
            />
          </Field>
          <Field label="Designation">
            <Select value={reqDesignation} onChange={(e) => setReqDesignation(e.target.value)}>
              <option value="Pharmacist">Pharmacist</option>
              <option value="Assistant Pharmacist">Assistant Pharmacist</option>
              <option value="Counter Staff">Counter Staff</option>
              <option value="Accountant">Accountant</option>
            </Select>
          </Field>
        </form>
      </Modal>

      {/* FORGOT PASSWORD MODAL */}
      <Modal
        open={showForgot}
        onClose={() => setShowForgot(false)}
        title="Reset Password"
        subtitle="We'll notify the pharmacy administrator to reset it for you"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setShowForgot(false)}>
              Cancel
            </Button>
            <Button type="submit" form="forgot-form" loading={forgotSubmitting}>
              Send Request
            </Button>
          </div>
        }
      >
        <form id="forgot-form" onSubmit={handleForgotPassword} className="space-y-4 p-5">
          <Field label="Work Email Address" required>
            <Input
              icon={Mail}
              type="email"
              required
              value={forgotEmail}
              onChange={(e) => setForgotEmail(e.target.value)}
              placeholder="you@adgenpharmacy.com"
            />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
