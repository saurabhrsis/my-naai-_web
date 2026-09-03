import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  ImageOff,
  LoaderCircle,
  MapPin,
  RefreshCw,
  Star,
  X,
} from 'lucide-react';
import { getFileUrl } from '../lib/api';

export const GOLD = '#e8b97e';
export const GREEN = '#6ed19e';
export const RED = '#f27b74';

export function cx(...classes) {
  return classes.filter(Boolean).join(' ');
}

export function firstName(value) {
  const name = String(value || '').trim().split(/\s+/)[0] || 'there';
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

export function formatDate(value, options = {}) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...options,
  });
}

export function formatTime(value) {
  if (!value) return '—';
  const [hours, minutes] = String(value).slice(0, 5).split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return String(value);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatCurrency(value) {
  const number = Number(value);
  if (Number.isNaN(number)) return `₹ ${value || 0}`;
  return `₹ ${number.toLocaleString('en-IN')}`;
}

export function getInitials(value) {
  const words = String(value || 'My Naai').trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map(word => word[0]).join('').toUpperCase() || 'MN';
}

export function getDistanceInKm(lat1, lon1, lat2, lon2) {
  const values = [lat1, lon1, lat2, lon2].map(Number);
  if (values.some(value => !Number.isFinite(value) || value === 0)) return null;
  const [aLat, aLon, bLat, bLon] = values;
  const radius = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return Number((radius * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))).toFixed(1));
}

export function getSalonStatus(businessHours = [], explicitOpen) {
  if (typeof explicitOpen === 'boolean') return explicitOpen ? { isOpen: true, text: 'OPEN NOW', color: GREEN } : { isOpen: false, text: 'CLOSED', color: RED };
  const schedule = Array.isArray(businessHours) ? businessHours[0] : businessHours;
  if (!schedule?.openingTime || !schedule?.closingTime) return { isOpen: false, text: 'CLOSED', color: RED };

  const nowParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', weekday: 'long', hour12: false,
  }).formatToParts(new Date());
  const currentDay = nowParts.find(part => part.type === 'weekday')?.value;
  const currentMinutes = Number(nowParts.find(part => part.type === 'hour')?.value || 0) * 60 + Number(nowParts.find(part => part.type === 'minute')?.value || 0);
  const opening = String(schedule.openingTime).slice(0, 5).split(':').map(Number);
  const closing = String(schedule.closingTime).slice(0, 5).split(':').map(Number);
  const openingMinutes = opening[0] * 60 + opening[1];
  const closingMinutes = closing[0] * 60 + closing[1];
  if ((schedule.holidayDays || []).some(day => String(day).toLowerCase() === String(currentDay).toLowerCase())) return { isOpen: false, text: 'CLOSED · HOLIDAY', color: RED };
  const isOpen = closingMinutes > openingMinutes
    ? currentMinutes >= openingMinutes && currentMinutes < closingMinutes
    : currentMinutes >= openingMinutes || currentMinutes < closingMinutes;
  return { isOpen, text: isOpen ? 'OPEN NOW' : 'CLOSED', color: isOpen ? GREEN : RED };
}

export function normalizeSalon(item = {}) {
  const status = getSalonStatus(item.businessHours, item.isOpen);
  return {
    ...item,
    id: item.salonId || item.id,
    name: item.salonName || item.name || 'Unnamed salon',
    address: item.addressLine1 || item.address || item.city || 'Location not available',
    location: item.city || '',
    rating: Number(item.ratingAverage || item.rating || 0),
    reviews: Number(item.totalReviews || item.reviews || 0),
    image: item.imageUrl || item.imagesArray?.[0] || '',
    images: item.imagesArray || (item.imageUrl ? [item.imageUrl] : []),
    isOpen: status.isOpen,
    statusText: status.text,
    statusColor: status.color,
    waitTime: item.totalWaitTime?.display || item.waitTime || '10–15 min',
  };
}

export function isBookingPassed(date, time) {
  if (!date) return false;
  const dateOnly = String(date).split('T')[0];
  const [year, month, day] = dateOnly.split('-').map(Number);
  const [hours, minutes] = String(time || '00:00').slice(0, 5).split(':').map(Number);
  const target = new Date(year, month - 1, day, hours || 0, minutes || 0, 0);
  return Date.now() >= target.getTime();
}

export function getErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  return error?.data?.message || error?.message || fallback;
}

export function Spinner({ label = '', size = 22 }) {
  return <span className="spinner-wrap"><LoaderCircle className="spin" size={size} aria-hidden="true" />{label && <span>{label}</span>}</span>;
}

export function ImageWithFallback({ src, fallback = '/assets/brand/naai-logo-dark.svg', alt = '', className = '', ...props }) {
  const [current, setCurrent] = useState(src ? getFileUrl(src) : fallback);
  useEffect(() => setCurrent(src ? getFileUrl(src) : fallback), [src, fallback]);
  return (
    <img
      src={current || fallback}
      alt={alt}
      className={className}
      onError={() => { if (current !== fallback) setCurrent(fallback); }}
      {...props}
    />
  );
}

export function PageHeader({ title, subtitle, onBack, action, eyebrow, compact = false }) {
  return (
    <header className={cx('page-header', compact && 'page-header-compact')}>
      <div className="page-header-leading">
        {onBack && <button className="icon-btn ghost" onClick={onBack} aria-label="Go back"><ArrowLeft size={19} /></button>}
        <div>
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      {action && <div className="page-header-action">{action}</div>}
    </header>
  );
}

export function IconButton({ label, children, className = '', ...props }) {
  return <button className={cx('icon-btn', className)} aria-label={label} title={label} {...props}>{children}</button>;
}

export function Button({ children, variant = 'primary', size = '', loading = false, className = '', ...props }) {
  return (
    <button className={cx('btn', `btn-${variant}`, size && `btn-${size}`, loading && 'is-loading', className)} disabled={loading || props.disabled} {...props}>
      {loading ? <Spinner size={17} /> : children}
    </button>
  );
}

export function StatusPill({ children, tone = 'neutral', dot = false }) {
  return <span className={cx('status-pill', `status-${tone}`)}>{dot && <i className="status-dot" />}{children}</span>;
}

export function EmptyState({ icon: Icon = ImageOff, title = 'Nothing here yet', message = '', action }) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><Icon size={28} /></div>
      <h3>{title}</h3>
      {message && <p>{message}</p>}
      {action}
    </div>
  );
}

export function Modal({ open, onClose, title, children, size = '', closeOnOverlay = true, footer }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = event => { if (event.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKeyDown);
    document.body.classList.add('modal-open');
    return () => { document.removeEventListener('keydown', onKeyDown); document.body.classList.remove('modal-open'); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={event => { if (closeOnOverlay && event.target === event.currentTarget) onClose?.(); }}>
      <section className={cx('modal-card', size && `modal-${size}`)} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-header"><h2>{title}</h2><IconButton label="Close" className="ghost" onClick={onClose}><X size={19} /></IconButton></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </section>
    </div>
  );
}

// `required` renders the same red asterisk the mobile editor uses for the
// fields its validation enforces, so partners can see what must be filled in
// while every section stays collapsed.
export function Field({ label, hint, error, required = false, children, className = '' }) {
  return (
    <label className={cx('field', required && 'field-is-required', className)}>
      {label && (
        <span className="field-label">
          {label}
          {required && <em className="required-star" aria-hidden="true">*</em>}
          {required && <span className="sr-only"> (required)</span>}
        </span>
      )}
      {children}
      {hint && <small className="field-hint">{hint}</small>}
      {error && <small className="field-error">{error}</small>}
    </label>
  );
}

export function SelectField({ label, value, onChange, options, placeholder = 'Select', required = false, hint, error, className = '', ...props }) {
  return (
    <Field label={label} required={required} hint={hint} error={error} className={className}>
      <span className="select-wrap">
        <select value={value} onChange={onChange} aria-required={required || undefined} {...props}>
          <option value="">{placeholder}</option>
          {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <ChevronDown size={16} />
      </span>
    </Field>
  );
}


export function Rating({ value = 0, reviews, light = false }) {
  return <span className={cx('rating', light && 'rating-light')}><Star size={14} fill="currentColor" /> <b>{Number(value || 0).toFixed(1)}</b>{reviews !== undefined && <small>({reviews})</small>}</span>;
}

export function LinkButton({ children, icon: Icon = ExternalLink, ...props }) {
  return <button className="text-link" {...props}>{children}<Icon size={14} /></button>;
}

export function DetailRow({ icon: Icon, label, value, action, tone = '' }) {
  return <div className={cx('detail-row', tone && `detail-${tone}`)}><span className="detail-icon"><Icon size={16} /></span><div><small>{label}</small><strong>{value}</strong></div>{action}</div>;
}

export function Toast({ toast, onClose }) {
  if (!toast) return null;
  const Icon = toast.type === 'error' ? CircleAlert : toast.type === 'success' ? CheckCircle2 : CircleDollarSign;
  return <div className={cx('toast', `toast-${toast.type || 'info'}`)} role="status"><Icon size={18} /><span>{toast.message}</span><button onClick={onClose} aria-label="Dismiss"><X size={15} /></button></div>;
}

export function SkeletonCard({ className = '' }) {
  return <div className={cx('skeleton-card', className)}><div className="skeleton skeleton-media" /><div className="skeleton-lines"><i className="skeleton" /><i className="skeleton short" /><i className="skeleton tiny" /></div></div>;
}

export function Toggle({ checked, onChange, label, disabled = false }) {
  return <label className={cx('toggle', disabled && 'disabled')}><input type="checkbox" checked={checked} onChange={event => onChange?.(event.target.checked)} disabled={disabled} /><span className="toggle-track"><i /></span>{label && <span>{label}</span>}</label>;
}

export function getBrowserLocation() {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      position => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 7000, maximumAge: 300000 },
    );
  });
}

export { Check, ChevronRight, Clock3, MapPin, RefreshCw, Star };
