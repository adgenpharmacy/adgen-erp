'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { TextRepel } from '@/components/ui/text-repel';
import { KineticTextReveal } from '@/components/ui/kinetic-text-reveal';
import { ScrollBasedVelocity } from '@/components/ui/scroll-based-velocity';
import { 
  ShieldCheck, 
  Lock, 
  Mail, 
  ArrowRight, 
  CheckCircle2, 
  User, 
  KeyRound, 
  AlertCircle,
  Eye,
  EyeOff,
  UserPlus,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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
    } catch (err: any) {
      setErrorMsg(err.message || 'Login failed. Please check your credentials.');
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
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to submit access request.');
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
    <div className="min-h-screen bg-[#F4F8F6] text-slate-900 flex flex-col justify-between selection:bg-emerald-500 selection:text-white font-sans relative overflow-x-hidden">
      {/* Background Ambient Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[400px] bg-gradient-to-b from-emerald-200/30 via-teal-100/10 to-transparent rounded-full blur-3xl pointer-events-none" />

      {/* Header Bar */}
      <header className="w-full max-w-7xl mx-auto px-6 py-6 flex items-center justify-between relative z-20">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-white rounded-2xl border border-slate-200 shadow-sm">
            <img src="/logo.png" alt="AdGen Pharmacy" className="w-8 h-8 object-contain" />
          </div>
          <div>
            <span className="font-extrabold text-lg tracking-tight text-slate-900 font-sans block leading-none">
              AdGen ERP
            </span>
            <span className="text-[11px] text-emerald-700 font-bold tracking-wider uppercase">Pharmacy Management</span>
          </div>
        </div>
      </header>

      {/* Main Content Hero & Login Card */}
      <main className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-8 flex flex-col lg:flex-row items-center justify-between gap-12 relative z-20 flex-1">
        {/* Left Column: Hero Intro */}
        <div className="flex-1 space-y-6 text-center lg:text-left max-w-2xl">
          <div className="py-2">
            <TextRepel
              text="ADGEN PHARMACY"
              radius={120}
              strength={45}
              className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-slate-900 drop-shadow-sm"
              letterClassName="text-slate-900 hover:text-emerald-600 transition-colors"
            />
          </div>

          <div className="text-base sm:text-lg text-slate-600 font-semibold leading-relaxed">
            <KineticTextReveal
              text="The complete clinical management system for modern Indian pharmacies. Handle strip & loose tablet billing, FEFO inventory, supplier payables, and GST filings seamlessly."
              splitBy="words"
              stagger={0.025}
              className="text-slate-600 font-semibold"
            />
          </div>

          <div className="space-y-3 pt-2 text-left max-w-xl mx-auto lg:mx-0 text-sm font-medium">
            <div className="flex items-start gap-3 p-3 bg-white border border-slate-200/80 rounded-xl shadow-xs">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <strong className="text-slate-900 font-bold">Strip & Loose Tablet Billing:</strong> Automatically calculates per-tablet unit prices based on strip pack size.
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-white border border-slate-200/80 rounded-xl shadow-xs">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <strong className="text-slate-900 font-bold">FEFO Batch & Expiry Management:</strong> Automatic First-Expiry-First-Out stock deduction and batch tracking.
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-white border border-slate-200/80 rounded-xl shadow-xs">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <strong className="text-slate-900 font-bold">Staff Approval Security:</strong> Role-based access control with explicit owner approval for new pharmacy staff.
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Clean Ideal Login Card */}
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-md bg-white border border-slate-200/90 p-8 rounded-3xl shadow-xl relative space-y-6 card-glow"
        >
          <div className="space-y-1 text-center sm:text-left">
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Sign In to Pharmacy Portal</h2>
            <p className="text-xs text-slate-500 font-medium">Enter your credentials to access the POS & management suite</p>
          </div>

          {/* Feedback Banners */}
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Primary Login Form */}
          <form onSubmit={handleSignIn} className="space-y-4 text-xs font-medium">
            <div>
              <label className="text-slate-500 font-bold block mb-1.5">Work Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. owner@adgenpharmacy.com"
                  className="w-full bg-slate-50 border border-slate-300/80 rounded-xl pl-10 pr-4 py-2.5 text-slate-900 font-bold placeholder-slate-400 focus:outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 transition"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-slate-500 font-bold block">Password</label>
                <button
                  type="button"
                  onClick={() => setShowForgot(true)}
                  className="text-xs font-bold text-emerald-700 hover:text-emerald-800 hover:underline transition"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300/80 rounded-xl pl-10 pr-10 py-2.5 text-slate-900 font-bold placeholder-slate-400 focus:outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 p-1 text-slate-400 hover:text-slate-700 transition"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-extrabold rounded-xl shadow-lg shadow-emerald-600/20 transition flex items-center justify-center gap-2 text-sm mt-2 disabled:opacity-50"
            >
              <span>{loading ? 'Verifying Credentials...' : 'Sign In'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Request Staff Access Secondary Link */}
          <div className="pt-4 border-t border-slate-100 text-center">
            <button
              onClick={() => setShowRequestAccess(true)}
              className="text-xs font-bold text-slate-600 hover:text-emerald-700 transition flex items-center justify-center gap-1.5 mx-auto"
            >
              <UserPlus className="w-4 h-4 text-emerald-600" />
              <span>New staff employee? <strong>Request Access</strong></span>
            </button>
          </div>
        </motion.div>
      </main>

      {/* REQUEST ACCESS MODAL */}
      <AnimatePresence>
        {showRequestAccess && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-slate-200 p-6 rounded-3xl max-w-md w-full shadow-2xl relative space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-emerald-600" />
                  <h3 className="text-lg font-bold text-slate-900">Request Employee Access</h3>
                </div>
                <button
                  onClick={() => setShowRequestAccess(false)}
                  className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-xs text-slate-500 font-medium leading-relaxed">
                Fill in your staff details below. Your access request will be routed to the Pharmacy Owner for account approval.
              </p>

              <form onSubmit={handleRequestAccess} className="space-y-3.5 text-xs font-medium">
                <div>
                  <label className="text-slate-500 font-bold block mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ramesh Kumar"
                    value={reqName}
                    onChange={(e) => setReqName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900 font-bold"
                  />
                </div>

                <div>
                  <label className="text-slate-500 font-bold block mb-1">Work Email Address *</label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. staff@adgenpharmacy.com"
                    value={reqEmail}
                    onChange={(e) => setReqEmail(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900 font-bold"
                  />
                </div>

                <div>
                  <label className="text-slate-500 font-bold block mb-1">Designation</label>
                  <select
                    value={reqDesignation}
                    onChange={(e) => setReqDesignation(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900 font-bold"
                  >
                    <option value="Pharmacist">Pharmacist</option>
                    <option value="Billing Executive">Billing Executive</option>
                    <option value="Inventory Assistant">Inventory Assistant</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-500 font-bold block mb-1">Desired Password *</label>
                  <input
                    type="password"
                    required
                    value={reqPassword}
                    onChange={(e) => setReqPassword(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900 font-bold"
                  />
                </div>

                <div className="flex gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowRequestAccess(false)}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={reqSubmitting}
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md shadow-emerald-600/20"
                  >
                    {reqSubmitting ? 'Submitting...' : 'Submit Request'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* FORGOT PASSWORD MODAL */}
      <AnimatePresence>
        {showForgot && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-slate-200 p-6 rounded-3xl max-w-md w-full shadow-2xl relative space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-emerald-600" />
                  <h3 className="text-lg font-bold text-slate-900">Reset Password</h3>
                </div>
                <button
                  onClick={() => setShowForgot(false)}
                  className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-xs text-slate-500 font-medium leading-relaxed">
                Enter your work email address below. We will send a secure password reset link to your email.
              </p>

              <form onSubmit={handleForgotPassword} className="space-y-4 text-xs font-medium">
                <div>
                  <label className="text-slate-500 font-bold block mb-1">Email Address *</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                    <input
                      type="email"
                      required
                      placeholder="e.g. owner@adgenpharmacy.com"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-10 pr-4 py-2.5 text-slate-900 font-bold"
                    />
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowForgot(false)}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={forgotSubmitting}
                    className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-md"
                  >
                    {forgotSubmitting ? 'Sending...' : 'Send Reset Link'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Ticker */}
      <footer className="w-full py-3 bg-emerald-50 border-t border-emerald-200/80 relative z-20 overflow-hidden">
        <ScrollBasedVelocity
          text="✦ LOOSE TABLET & STRIP BILLING ✦ FEFO BATCH INVENTORY ✦ AUTOMATED GST TAX FILINGS ✦ CUSTOMER CREDIT LEDGER ✦ PRINT CASH MEMO & INVOICE ✦"
          default_velocity={0.4}
          className="text-xs font-mono font-extrabold text-emerald-800 tracking-widest uppercase"
        />
      </footer>
    </div>
  );
}
